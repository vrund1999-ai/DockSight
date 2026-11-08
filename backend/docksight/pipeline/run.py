"""End-to-end batch pipeline: generate -> load -> train -> score.

    python -m docksight.pipeline.run            # full pipeline
    python -m docksight.pipeline.run --skip-generate   # retrain + rescore on existing data

In production the generate step would be replaced by ingestion from source systems (property
management, CRM, market data vendors), and this would run as a scheduled job (e.g. Databricks
Workflows or an Azure Container Apps job).
"""

import argparse
import logging

import pandas as pd
from sqlalchemy import delete
from sqlalchemy.engine import Engine

from docksight.config import get_settings
from docksight.db import Prediction, engine
from docksight.ml.features import build_features
from docksight.ml.model import ModelArtifact
from docksight.ml.train import train
from docksight.pipeline.generate import AS_OF, Portfolio, generate
from docksight.pipeline.io import read_portfolio, write_portfolio

log = logging.getLogger("docksight.pipeline")


def features_for(portfolio: Portfolio) -> pd.DataFrame:
    return build_features(
        portfolio.leases,
        portfolio.properties,
        portfolio.tenants,
        portfolio.markets,
        portfolio.market_stats,
        as_of=AS_OF,
    )


def score(eng: Engine, features: pd.DataFrame, artifact: ModelArtifact) -> int:
    active = features[features["renewed"].isna()]
    preds = pd.DataFrame(
        {
            "lease_id": active["lease_id"],
            "model_version": artifact.version,
            "renewal_probability": artifact.predict_proba(active).round(4),
            "scored_on": AS_OF,
        }
    )
    with eng.begin() as conn:
        conn.execute(delete(Prediction))
        preds.to_sql("predictions", conn, if_exists="append", index=False)
    return len(preds)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--skip-generate", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = get_settings()

    if not args.skip_generate:
        portfolio = generate(seed=settings.seed)
        write_portfolio(engine, portfolio)
        log.info(
            "Loaded %d properties, %d leases", len(portfolio.properties), len(portfolio.leases)
        )

    features = features_for(read_portfolio(engine))
    artifact = train(features)
    artifact.save(settings.model_path)
    log.info("Saved model to %s", settings.model_path)
    log.info("Scored %d active leases", score(engine, features, artifact))


if __name__ == "__main__":
    main()
