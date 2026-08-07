#!/usr/bin/env bash
set -euo pipefail

echo "Enable corepack and activate pnpm"
if command -v corepack >/dev/null 2>&1; then
  corepack enable || true
  corepack prepare pnpm@latest --activate || true
else
  echo "corepack not found; if pnpm is missing, install it in the Codespace before continuing"
fi

echo "Install dependencies"
pmn() { pnpm "$@"; }
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
else
  echo "pnpm is not installed. Try: corepack enable && corepack prepare pnpm@latest --activate"
  exit 1
fi

echo "Start local infra with docker compose"
docker compose -f docker-compose.codespace.yml up -d

echo "Run database migrations"
pnpm db:migrate

echo "Seed database (may fail if already seeded)"
set +e
pnpm db:seed
set -e

echo "Start dev servers in background (logs: api.log, worker.log, storefront.log, admin.log)"
nohup pnpm dev:api > api.log 2>&1 &
nohup pnpm dev:worker > worker.log 2>&1 &
nohup pnpm dev:storefront > storefront.log 2>&1 &
nohup pnpm dev:admin > admin.log 2>&1 &

echo "All done. Tail logs with e.g. tail -n 200 api.log or view files: api.log storefront.log"
