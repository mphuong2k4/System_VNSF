# Staging deployment

Use separate private PostgreSQL/Redis/object storage, TLS origins, secret manager, immutable image digest, non-root containers and a one-shot migration job. Require backup, migration dry-run, contract/smoke/E2E/ZAP/k6 checks, alert routing and rollback owner. No production deploy is automated by this repository.
