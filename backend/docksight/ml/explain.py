"""Local explanations for individual renewal predictions.

Method: counterfactual feature substitution. For each feature, swap the lease's value for the
portfolio's "typical lease" value and measure how much the predicted probability moves. The
difference is that feature's contribution relative to a typical lease.

It's model-agnostic, cheap (one batched predict call per lease), and easy to explain to a
non-technical asset manager: "if this tenant paid market rent, their renewal odds would rise by
12 points". It ignores feature interactions; SHAP would handle those at higher cost and complexity.
"""

from dataclasses import dataclass

import pandas as pd

from docksight.ml.features import FEATURE_LABELS, FEATURES
from docksight.ml.model import ModelArtifact


@dataclass
class Contribution:
    feature: str
    label: str
    value: float | str
    typical_value: float | str
    impact: float  # Change in renewal probability attributable to this feature (+ helps renewal).


def explain(artifact: ModelArtifact, row: pd.Series) -> tuple[float, list[Contribution]]:
    base = pd.DataFrame([row[FEATURES]])
    variants = pd.concat([base] * len(FEATURES), ignore_index=True)
    for i, feature in enumerate(FEATURES):
        variants.loc[i, feature] = artifact.reference[feature]
    variants = variants.astype(base.dtypes.to_dict())

    p = float(artifact.predict_proba(base).iloc[0])
    p_counterfactual = artifact.predict_proba(variants).to_numpy()

    contributions = [
        Contribution(
            feature=f,
            label=FEATURE_LABELS[f],
            value=_clean(row[f]),
            typical_value=_clean(artifact.reference[f]),
            impact=round(p - float(p_counterfactual[i]), 4),
        )
        for i, f in enumerate(FEATURES)
    ]
    contributions.sort(key=lambda c: abs(c.impact), reverse=True)
    return p, contributions


def _clean(v: object) -> float | str:
    return v if isinstance(v, str) else round(float(v), 4)
