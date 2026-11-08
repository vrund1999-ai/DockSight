# 2. Batch-scored probabilities, on-demand explanations

**Status:** Accepted

## Context

Renewal risk changes slowly: inputs are lease terms and monthly market data. Users need fast list
views (sort and filter 1,000+ leases) and occasionally a detailed "why" for one lease.

## Decision

- A scheduled pipeline writes probabilities to a `predictions` table, stamped with `model_version`.
  List and aggregate endpoints are plain SQL joins against it.
- Explanations are computed on request for a single lease, using the same feature code and model
  artifact.

## Alternatives considered

- **Score everything on every request:** simple, but puts model inference on the hot path for list
  and KPI endpoints, and prevents doing the sorting and filtering in SQL.
- **Pre-compute explanations too:** 13 counterfactual predictions per lease is cheap, but storing
  them adds a table and a schema to maintain for a view that's opened rarely.

## Consequences

- Every score is auditable: which model version produced it, and when.
- Retraining without rescoring would show stale probabilities next to fresh explanations; the
  pipeline always does both in one run to prevent that.
