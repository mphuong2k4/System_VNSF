#!/usr/bin/env sh
set -eu
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
