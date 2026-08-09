# Staging release runbook

The staging Compose file intentionally contains only VNSF application images. PostgreSQL, Redis, object storage, SMTP and ClamAV must be private managed services (or separately operated services) and are supplied through `.env.staging`.

1. Copy `.env.staging.example` to an untracked `.env.staging` and replace every placeholder from the deployment secret manager.
2. Set `VNSF_API_IMAGE`, `VNSF_WORKER_IMAGE` and `VNSF_WEB_IMAGE` to immutable registry tags or digests produced from the same commit.
3. Validate with `docker compose -f docker-compose.staging.yml config`.
4. Deploy with `docker compose -f docker-compose.staging.yml up -d`. The one-shot migration must succeed before API and worker start.
5. Verify `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/metrics`, login, one scoped read and one CSRF-protected write. Run `PERF_BASE_URL=https://staging-host pnpm test:perf` from a trusted runner.
6. Roll back application images to the prior immutable set. Database migrations are forward-only; review migration compatibility before every release.

Do not commit `.env.staging`, expose dependency ports, use the example credentials, or run `seed:e2e` outside an isolated test database.
