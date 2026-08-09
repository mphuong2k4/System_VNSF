# VNSF Scholarship Management

Cloud-neutral modular monolith for the VNSF scholarship-management MVP. Business Specification v5.5 (especially appendices G/H) controls business behavior and Website Build Guide v1.4 (especially chapters 18/19) controls implementation.

## Prerequisites

- Node.js 22 LTS and pnpm 10
- Docker with Compose

Copy `.env.example` to `.env`, replace development secrets, then run `docker compose up -d postgres redis minio mailpit clamav`, `pnpm install`, `pnpm db:migrate`, and `pnpm dev`.

For the complete containerized stack, run `docker compose up -d --build` and open `http://localhost:5174`. The direct Vite development server remains at `http://localhost:5173`.

Repository layout: `apps/api` is the NestJS 11 HTTP process, `apps/worker` owns BullMQ consumers, `apps/web` is React 19/Vite, and shared configuration/contracts live under `packages`. PostgreSQL is the source of truth; Redis is never authoritative. All object data is private and follows quarantine → scan → promote.

Development verification: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Integration checks require the isolated dependencies from `docker compose -f docker-compose.test.yml up -d` and `RUN_INTEGRATION=true pnpm test:integration`. Browser checks require the full local stack, a synthetic account created only in its disposable test database with `APP_ENV=test E2E_ALLOW_SEED=true pnpm --filter @vnsf/api seed:e2e`, and then `pnpm test:e2e`. The portable liveness baseline is `pnpm test:perf`; dedicated k6 runners can use `pnpm test:perf:k6`. See `docs/implementation/staging-runbook.md` for staging deployment.

The isolated PostgreSQL restore exercise is `DR_ALLOW_RESTORE=true pnpm test:dr`; see `docs/implementation/disaster-recovery.md` before running it. Release tags publish commit-addressed API, worker and web images with SBOM and provenance through GitHub Actions.

No production password or real personal data belongs in this repository. The system tracks manual transfers only; it never initiates payments.
