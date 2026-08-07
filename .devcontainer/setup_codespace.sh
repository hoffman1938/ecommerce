#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/ecommerce

echo "Enable corepack and activate pnpm"
corepack enable
corepack prepare pnpm@latest --activate

echo "Install dependencies"
pnpm install --frozen-lockfile

echo "Start local infra with docker compose"
docker compose -f docker-compose.codespace.yml up -d

echo "Run database migrations"
pnpm db:migrate

echo "Seed database"
pnpm db:seed || true

echo "Start dev servers in background (logs: api.log, worker.log, storefront.log, admin.log)"
nohup pnpm dev:api > api.log 2>&1 &
nohup pnpm dev:worker > worker.log 2>&1 &
nohup pnpm dev:storefront > storefront.log 2>&1 &
nohup pnpm dev:admin > admin.log 2>&1 &

echo "Done. Tail logs with: tail -n 200 api.log"
