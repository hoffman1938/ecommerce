#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/ecommerce

echo "==> Activate the pinned pnpm through corepack"
corepack prepare pnpm@9.15.0 --activate

echo "==> Install dependencies"
# No pnpm-lock.yaml is committed yet, so --frozen-lockfile cannot succeed here.
pnpm install --no-frozen-lockfile

echo "==> Start local infrastructure (postgres, redis, minio + buckets, mailpit)"
# Not --wait: minio-init is a one-shot container that exits 0 once the buckets
# exist. Migrations run several minutes later, after the package builds.
docker compose -f docker-compose.codespace.yml up -d

echo "==> Write environment files"
# packages/config walks up from the CWD to find the repo-root file, but the
# Next.js apps only read env files from their own directory, and the Prisma CLI
# only reads them from the schema's package. All four need a copy.
if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
fi

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  echo "    Codespace detected — rewriting URLs for forwarded ports"
  base="https://${CODESPACE_NAME}"
  domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  sed -i \
    -e "s|^STOREFRONT_URL=.*|STOREFRONT_URL=${base}-3000.${domain}|" \
    -e "s|^ADMIN_URL=.*|ADMIN_URL=${base}-3001.${domain}|" \
    -e "s|^API_URL=.*|API_URL=${base}-4000.${domain}|" \
    -e "s|^NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=${base}-4000.${domain}|" \
    -e "s|^NEXT_PUBLIC_STOREFRONT_URL=.*|NEXT_PUBLIC_STOREFRONT_URL=${base}-3000.${domain}|" \
    -e "s|^NEXT_PUBLIC_ADMIN_URL=.*|NEXT_PUBLIC_ADMIN_URL=${base}-3001.${domain}|" \
    -e "s|^NEXT_PUBLIC_ASSET_BASE_URL=.*|NEXT_PUBLIC_ASSET_BASE_URL=${base}-9000.${domain}|" \
    -e "s|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=${base}-9000.${domain}|" \
    -e "s|^TRUSTED_ORIGINS=.*|TRUSTED_ORIGINS=${base}-3000.${domain},${base}-3001.${domain}|" \
    -e "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" \
    -e "s|^COOKIE_SAMESITE=.*|COOKIE_SAMESITE=none|" \
    .env.local
fi

cp .env.local apps/storefront/.env.local
cp .env.local apps/admin/.env.local
cp .env.local packages/database/.env

echo "==> Generate the Prisma client and build the shared packages"
# The apps import these from dist/, so they must be built before the dev servers start.
pnpm db:generate
pnpm -r --filter "./packages/**" build

echo "==> Apply migrations and seed"
pnpm db:migrate
pnpm db:seed

echo "==> Start dev servers (logs: api.log, worker.log, storefront.log, admin.log)"
# The worker runs its compiled build: `tsx watch` opens a stdin ReadStream and
# dies with EBADF when backgrounded under nohup.
pnpm --filter @outlet/worker build
nohup pnpm dev:api > api.log 2>&1 &
nohup pnpm --filter @outlet/worker start > worker.log 2>&1 &
nohup pnpm dev:storefront > storefront.log 2>&1 &
nohup pnpm dev:admin > admin.log 2>&1 &

cat <<'EOF'

Done. Tail logs with: tail -n 200 api.log

  Storefront  http://localhost:3000
  Admin       http://localhost:3001
  API / docs  http://localhost:4000/docs
  Mailpit     http://localhost:8025
  MinIO       http://localhost:9001  (minio / minio123)

  Super Admin  admin@example.local    / Admin123!
  Customer     customer@example.local / Customer123!

In a browser-based Codespace, open the forwarded -3000 URL instead of
localhost, and set ports 4000 and 9000 to Public in the Ports tab. Opening the
Codespace in VS Code Desktop forwards ports to real localhost and needs neither.
EOF
