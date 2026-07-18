# Development image for all workspace apps (api, worker, storefront, admin).
# The service `command` in docker-compose.yml selects which app runs.
#
# This intentionally runs the apps in watch/dev mode for the local-first MVP.
# Production images would use multi-stage builds per app (documented in
# /docs/deployment.md) — production deployment is out of scope for the MVP.

FROM node:20-alpine

RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo

# Install dependencies first for better layer caching.
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/storefront/package.json apps/storefront/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/payments/package.json packages/payments/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY e2e/package.json e2e/package.json

RUN pnpm install --no-frozen-lockfile

# Copy sources, generate the Prisma client, and build shared packages.
COPY . .
RUN pnpm --filter @outlet/database generate
RUN pnpm -r --filter "./packages/**" build

EXPOSE 3000 3001 4000

CMD ["pnpm", "--filter", "@outlet/api", "start:dev"]
