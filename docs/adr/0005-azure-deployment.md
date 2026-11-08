# 5. Azure deployment target

**Status:** Proposed (next phase)

## Context

The stack is containerized (one backend image, one nginx image) and stateless apart from Postgres
and the model artifact. We want managed infrastructure with low operating overhead and a path to
enterprise identity.

## Decision

| Concern | Azure service |
|---|---|
| API, web, Model Lab | **Azure Container Apps** (scale to zero; revisions for blue/green) |
| Batch pipeline | **Container Apps Job** on a cron schedule |
| Database | **Azure Database for PostgreSQL – Flexible Server** |
| Model artifacts + MLflow | **Blob Storage** (artifacts) + MLflow on Postgres backend store |
| Images | **Azure Container Registry**, pushed from GitHub Actions via OIDC (no stored secrets) |
| Secrets | **Key Vault**, referenced by Container Apps through managed identity |
| Identity | **Microsoft Entra ID**: MSAL in the SPA; API validates tokens against tenant JWKS |
| Infra as code | **Bicep** |

## Why not AKS first

Kubernetes gives more control, but for three services it adds cluster operations with no
functional gain. Container Apps runs on Kubernetes underneath; manifests for AKS can be added
once there's a reason (e.g. GPU inference or a shared platform cluster).

## Consequences

- `docksight/api/security.py` is the only module that changes for Entra ID.
- `config.py` already reads all settings from environment variables, so no code changes are
  needed for Postgres or secrets.
