# 3. Time-based validation and decision-time features

**Status:** Accepted

## Context

Renewal outcomes depend heavily on the market regime: tenants rarely leave in a 2% vacancy market
and often do in an 8% one. A random train/test split puts 2025 leases in training and 2025 leases
in test, so the model "knows" the regime it's evaluated on.

Separately, the market conditions at the exact expiry date are known for historical leases but
never for the leases we score today.

## Decision

1. **Holdout = leases expiring on or after July 2024.** Training uses only earlier expirations.
   Model selection uses holdout log loss.
2. **Market features are snapshotted 12 months before expiry,** the point at which asset
   managers open renewal conversations. For active leases, that snapshot is clamped to the latest
   available month.

## Consequences

- Holdout metrics (AUC 0.79) are honest estimates for future leases, and lower than a random
  split would report.
- The chosen model is refit on all labelled data before serving; the Streamlit lab says so, since
  its holdout charts are slightly optimistic for the refit model.
- A test (`test_features_never_look_past_as_of`) guards the leakage boundary.
