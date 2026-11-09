# 5. Azure deployment target

**Status:** Accepted (implemented in `infra/main.bicep` and `.github/workflows/deploy.yml`)

## Context

The stack is containerized (one backend image, one nginx image) and stateless apart from Postgres
and the model artifact. We want managed infrastructure with low operating overhead, a cost close to
zero when idle, and a path to enterprise identity.

## Decision

| Concern | Azure service |
|---|---|
| Web, API, Model Lab | **Azure Container Apps**, consumption plan, scale to zero. Only the web app and the lab are public; the API has internal ingress and is reached through nginx. |
| Batch pipeline | **Container Apps Job** on a monthly cron, also started by every deploy so data and model always match the deployed code |
| Database | **Azure Database for PostgreSQL Flexible Server** (Burstable B1ms): one database for the app, one for MLflow tracking |
| Model artifact | **Azure Files** share mounted by the job, the API and the lab |
| Images | **GitHub Container Registry**, pushed by GitHub Actions |
| Azure sign-in from CI | **OIDC federated credential** on an Entra app registration, scoped to the `production` environment. No stored Azure secrets. |
| App secrets | Container Apps secrets, supplied from GitHub environment secrets at deploy time |
| Infra as code | **Bicep**, one file, applied on every deploy (idempotent) |

### Where this differs from the first draft, and why

- **Azure Files instead of Blob Storage for the artifact.** Container Apps mounts a file share
  natively, so the code keeps reading a path. Blob would need an SDK and credentials in the app.
  Writes are atomic (write, then rename) and the API reloads the model when the file's mtime
  changes, so a retrain never leaves explanations running on the old model.
- **MLflow tracking in Postgres, not SQLite.** SQLite on a network share is unsafe under locking.
  CI runs the Postgres leg with the same setup.
- **GHCR instead of Azure Container Registry.** Free for public images. ACR (with managed-identity
  pull) is the swap for a private codebase.
- **Container Apps secrets instead of Key Vault.** For two secrets, Key Vault adds a vault, an
  identity and role assignments with no functional gain here. It's the next step for rotation and
  audit.

## Why not AKS first

Kubernetes gives more control, but for three services it adds cluster operations with no
functional gain. Container Apps runs on Kubernetes underneath; manifests for AKS can be added
once there's a reason (e.g. GPU inference or a shared platform cluster).

## Consequences

- Idle cost is roughly the database alone (B1ms, about $15/month, covered by the Azure free
  account for 12 months). Apps scale to zero, so the first request after a quiet period waits a
  few seconds for a cold start.
- Postgres allows connections from Azure services (TLS and password required). VNet integration
  with a private endpoint is the hardening step; it requires a workload-profile environment.
- `docksight/api/security.py` is the only module that changes for Entra ID sign-in.
- `config.py` reads every setting from the environment, so no code is Azure-specific.
