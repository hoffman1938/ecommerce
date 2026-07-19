# Future production deployment (prepared, not executed)

The MVP is local-first. Nothing deploys automatically. Both strategies below are supported by the
existing architecture because every external service sits behind a provider interface and every
runtime-specific value is environment-driven (see `packages/config`).

## Strategy A — Cloudflare frontends, independent backend (recommended first step)

```text
Storefront -> Cloudflare Pages
Admin      -> Cloudflare Pages
API        -> Container platform (Fly.io / Render / ECS / Cloud Run / VPS)
Worker     -> Same container platform (separate process)
Database   -> Managed PostgreSQL (Neon, RDS, Supabase, ...)
Redis      -> Managed Redis (Upstash, Elasticache, ...)
Storage    -> Cloudflare R2 (STORAGE_PROVIDER=r2)
Email      -> Real SMTP relay / SES behind the same EmailProvider interface
Payments   -> PAYMENT_PROVIDER=stripe with live keys + webhook secret
Captcha    -> CAPTCHA_PROVIDER=turnstile
```

Steps:

1. Build production images for `apps/api` (`nest build`) and `apps/worker` (`tsc`) — multi-stage
   Dockerfiles per app; run `prisma migrate deploy` as a release step.
2. Deploy the storefront and admin to Cloudflare Pages using the officially supported Next.js
   adapter current at deployment time (see `infrastructure/cloudflare/`).
3. Set environment variables per environment — no code changes:
   `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_ASSET_BASE_URL`, `TRUSTED_ORIGINS`,
   `COOKIE_DOMAIN`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none` (cross-domain), `TRUST_PROXY=true`.
4. Point Stripe webhooks at `https://api.<domain>/payments/webhook/stripe`.

Cross-domain cookies: with the API on `api.example.com` and Pages on `www.example.com`, either set
`COOKIE_DOMAIN=.example.com` with `SameSite=Lax`, or serve the API under the same registrable
domain via a Cloudflare route. Both are pure configuration.

## Strategy B — deeper Cloudflare migration (later)

```text
Storefront/Admin -> Cloudflare Pages
API              -> Cloudflare Workers
PostgreSQL       -> Managed PostgreSQL through Hyperdrive
Object storage   -> R2   |  Queues -> Cloudflare Queues  |  Workflows -> long-running jobs
Captcha          -> Turnstile
```

What the codebase already isolates for this move:

- Business logic lives in `packages/domain` + services, not in NestJS controllers; a Workers
  HTTP layer (e.g. Hono) can reuse the services with a Workers-compatible Prisma driver.
- `QueueClient` is the only queue seam — implement it over Cloudflare Queues and move the
  worker's processors into queue consumers/Workflows.
- `CloudflareR2StorageProvider` already exists (R2 is S3-compatible).
- Argon2 (native module) would move behind the auth interface to a Workers-compatible KDF, or
  authentication stays on a small container while the rest migrates.

Do not force Strategy B for the MVP — Strategy A is the low-risk path.

## Production checklist (either strategy)

- Rotate `SESSION_SECRET`, database, MinIO/S3, SMTP, Stripe secrets — never the seed values.
- `COOKIE_SECURE=true`, HTTPS everywhere, `TRUST_PROXY=true` behind Cloudflare.
- Remove/disable the mock provider route by setting `PAYMENT_PROVIDER=stripe`.
- Keep `pnpm db:migrate` (deploy) in the release pipeline before app rollout.
- Configure backups for PostgreSQL and lifecycle rules for R2.
