# VNSF Scholarship Management

Cloud-neutral modular monolith for the VNSF scholarship-management MVP. Business Specification v5.5 (especially appendices G/H) controls business behavior and Website Build Guide v1.4 (especially chapters 18/19) controls implementation.

## Prerequisites

- Node.js 22 LTS and pnpm 10
- Docker with Compose

Copy `.env.example` to `.env`, replace development secrets, then run `docker compose up -d postgres redis minio mailpit clamav`, `pnpm install`, `pnpm db:migrate`, and `pnpm dev`.

Repository layout: `apps/api` is the NestJS 11 HTTP process, `apps/worker` owns BullMQ consumers, `apps/web` is React 19/Vite, and shared configuration/contracts live under `packages`. PostgreSQL is the source of truth; Redis is never authoritative. All object data is private and follows quarantine → scan → promote.

Development verification: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Integration and E2E checks require `docker compose -f docker-compose.test.yml up -d`, then `pnpm test:integration` and `pnpm test:e2e`.

No production password or real personal data belongs in this repository. The system tracks manual transfers only; it never initiates payments.
