"""Train the lease-renewal model.

- Time-based holdout: train on leases that expired before HOLDOUT_START, evaluate on later ones.
  A random split would leak future market regimes into training and overstate accuracy.
- Two candidates: an interpretable logistic-regression baseline and gradient boosting. The
  winner (by holdout log loss) is refit on all labelled data before being saved.
- Every run is logged to MLflow when it's installed (`pip install -e .[ml]`).
"""

import logging
from datetime import UTC, date, datetime

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from docksight.config import get_settings
from docksight.ml.features import CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES
from docksight.ml.model import ModelArtifact, reference_row

log = logging.getLogger(__name__)

TRAIN_START = date(2016, 1, 1)
HOLDOUT_START = date(2024, 7, 1)


def _candidates() -> dict[str, Pipeline]:
    one_hot = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    return {
        "logistic_regression": Pipeline(
            [
                (
                    "prep",
                    ColumnTransformer(
                        [
                            ("num", StandardScaler(), NUMERIC_FEATURES),
                            ("cat", one_hot, CATEGORICAL_FEATURES),
                        ]
                    ),
                ),
                ("clf", LogisticRegression(max_iter=1000, C=1.0)),
            ]
        ),
        "gradient_boosting": Pipeline(
            [
                (
                    "prep",
                    ColumnTransformer(
                        [
                            ("num", "passthrough", NUMERIC_FEATURES),
                            ("cat", one_hot, CATEGORICAL_FEATURES),
                        ]
                    ),
                ),
                (
                    "clf",
                    HistGradientBoostingClassifier(
                        max_iter=300,
                        learning_rate=0.05,
                        max_leaf_nodes=15,
                        l2_regularization=1.0,
                        early_stopping=True,
                        random_state=0,
                    ),
                ),
            ]
        ),
    }


def _metrics(y: pd.Series, p: pd.Series) -> dict[str, float]:
    return {
        "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "log_loss": round(float(log_loss(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "base_rate": round(float(y.mean()), 4),
    }


def labelled(features: pd.DataFrame) -> pd.DataFrame:
    df = features[features["renewed"].notna() & (features["end_date"] >= TRAIN_START)].copy()
    df["renewed"] = df["renewed"].astype(bool).astype(int)
    return df


def train(features: pd.DataFrame) -> ModelArtifact:
    data = labelled(features)
    train_df = data[data["end_date"] < HOLDOUT_START]
    test_df = data[data["end_date"] >= HOLDOUT_START]
    log.info("Training on %d leases, evaluating on %d", len(train_df), len(test_df))

    tracking = _mlflow()
    results: dict[str, dict[str, float]] = {}
    for name, pipe in _candidates().items():
        pipe.fit(train_df[FEATURES], train_df["renewed"])
        results[name] = _metrics(test_df["renewed"], pipe.predict_proba(test_df[FEATURES])[:, 1])
        log.info("%s holdout: %s", name, results[name])
        if tracking:
            with tracking.start_run(run_name=name):
                tracking.log_params(
                    {
                        "algorithm": name,
                        "n_train": len(train_df),
                        "n_test": len(test_df),
                        "holdout_start": str(HOLDOUT_START),
                    }
                )
                tracking.log_metrics(results[name])

    best = min(results, key=lambda n: results[n]["log_loss"])
    final = _candidates()[best].fit(data[FEATURES], data["renewed"])
    trained_at = datetime.now(UTC)
    artifact = ModelArtifact(
        pipeline=final,
        version=trained_at.strftime("%Y%m%d.%H%M%S"),
        algorithm=best,
        trained_at=trained_at.isoformat(timespec="seconds"),
        metrics={**results[best], "n_train": len(data)},
        reference=reference_row(data),
    )
    log.info("Selected %s (version %s)", best, artifact.version)
    return artifact


def _mlflow():
    try:
        import mlflow
    except ImportError:
        log.info("MLflow not installed; skipping experiment tracking.")
        return None
    mlflow.set_tracking_uri(get_settings().mlflow_tracking_uri)
    mlflow.set_experiment("lease-renewal")
    return mlflow
