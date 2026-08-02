#!/usr/bin/env sh
set -eu
test -f .env || cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres redis minio mailpit clamav
pnpm db:migrate
