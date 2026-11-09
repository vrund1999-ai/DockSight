import os
from dataclasses import replace

import pandas as pd

from docksight.ml.explain import explain
from docksight.ml.features import FEATURES, NUMERIC_FEATURES
from docksight.ml.model import load_artifact
from docksight.ml.train import HOLDOUT_START, labelled
from docksight.pipeline.generate import AS_OF, generate


def test_generation_is_deterministic():
    a, b = generate(seed=1, n_properties=30), generate(seed=1, n_properties=30)
    pd.testing.assert_frame_equal(a.leases, b.leases)


def test_only_expired_leases_have_outcomes(portfolio):
    leases = portfolio.leases
    assert leases.loc[leases["end_date"] > AS_OF, "renewed"].isna().all()
    assert leases.loc[leases["end_date"] <= AS_OF, "renewed"].notna().all()


def test_active_leases_have_commenced(portfolio):
    active = portfolio.leases[portfolio.leases["end_date"] > AS_OF]
    assert (active["start_date"] <= AS_OF).all()
    assert (active["end_date"] > active["start_date"]).all()


def test_features_never_look_past_as_of(features):
    assert features[NUMERIC_FEATURES].notna().all().all()
    labelled_rows = labelled(features)
    assert labelled_rows["end_date"].max() <= AS_OF


def test_model_beats_chance_on_future_leases(artifact):
    assert artifact.metrics["roc_auc"] > 0.68
    assert artifact.metrics["brier"] < 0.25


def test_holdout_is_strictly_later_than_training(features):
    data = labelled(features)
    assert (data["end_date"] >= HOLDOUT_START).sum() > 100


def test_paying_above_market_hurts_renewal_odds(artifact, features):
    row = features[features["renewed"].isna()].iloc[0].copy()
    cheap, pricey = row.copy(), row.copy()
    cheap["rent_to_market"], pricey["rent_to_market"] = 0.85, 1.25
    p_cheap, _ = explain(artifact, cheap)
    p_pricey, _ = explain(artifact, pricey)
    assert p_cheap > p_pricey


def test_api_picks_up_a_retrained_model(artifact, tmp_path):
    # The scheduled job retrains while the API is running; explanations must follow the new model.
    path = tmp_path / "model.joblib"
    artifact.save(path)
    first = load_artifact(path)
    assert load_artifact(path) is first

    replace(artifact, version="retrained").save(path)
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
    assert load_artifact(path).version == "retrained"
    assert not path.with_suffix(".tmp").exists()


def test_explanations_cover_every_feature(artifact, features):
    p, drivers = explain(artifact, features.iloc[0])
    assert 0 < p < 1
    assert {d.feature for d in drivers} == set(FEATURES)
    impacts = [abs(d.impact) for d in drivers]
    assert impacts == sorted(impacts, reverse=True)
