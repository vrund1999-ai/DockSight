# 1. One Python package for pipeline, ML, and API

**Status:** Accepted

## Context

The model's features (rent vs. market, market vacancy, tenant credit, …) are computed when we
train, when we batch-score, when the API explains a single lease, and in the Streamlit lab. If
each of those computed features separately, they would drift apart. Training/serving skew is one
of the most common silent failures in production ML.

## Decision

Keep `pipeline`, `ml`, and `api` as subpackages of one installable package (`docksight`), with a
single `build_features()` used everywhere. Ship one Docker image whose command selects the role
(batch job, API, or Streamlit).

## Consequences

- The API test `test_lease_detail_matches_batch_score` checks parity: the live explanation's
  probability must match the batch score.
- The API image carries ML dependencies it only partly needs (scikit-learn, pandas). That's
  acceptable at this size; if it grows, split into `docksight-core` + role-specific images.
- Data scientists and application engineers work in the same repo and review each other's changes.
