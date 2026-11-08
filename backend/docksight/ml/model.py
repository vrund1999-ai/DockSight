"""Model artifact: the fitted pipeline plus the metadata needed to serve and explain it."""

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd
from sklearn.pipeline import Pipeline

from docksight.config import get_settings
from docksight.ml.features import CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES


@dataclass
class ModelArtifact:
    pipeline: Pipeline
    version: str
    algorithm: str
    trained_at: str
    metrics: dict[str, float]
    # A "typical lease" used as the counterfactual baseline for explanations.
    reference: dict[str, float | str] = field(default_factory=dict)

    def predict_proba(self, X: pd.DataFrame) -> pd.Series:
        return pd.Series(self.pipeline.predict_proba(X[FEATURES])[:, 1], index=X.index)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)


def reference_row(X: pd.DataFrame) -> dict[str, float | str]:
    ref: dict[str, float | str] = {c: float(X[c].median()) for c in NUMERIC_FEATURES}
    ref |= {c: str(X[c].mode().iloc[0]) for c in CATEGORICAL_FEATURES}
    return ref


@lru_cache
def load_artifact(path: Path | None = None) -> ModelArtifact:
    path = path or get_settings().model_path
    if not path.exists():
        raise FileNotFoundError(
            f"No model artifact at {path}. Run `python -m docksight.pipeline.run` first."
        )
    return joblib.load(path)
