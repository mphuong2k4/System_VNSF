# Local deployment

Copy `.env.example` to `.env` and use synthetic values only. Run `infra/scripts/setup.sh`, then `pnpm dev`, or `docker compose up --build`. Services: web 5173, API 3000, PostgreSQL 5432, Redis 6379, MinIO 9000/9001 and Mailpit 8025. Reset is destructive and requires typing `RESET-VNSF`.
