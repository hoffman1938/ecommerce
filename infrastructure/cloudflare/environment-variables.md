# Environment variables per app (production)

No secrets in this file — set real values in the Pages/host dashboards or a secret manager.

## The demo deployment (Workers + D1)

Only one variable is set by hand; the rest the build derives from it.

| Variable           | Where                 | Value                                                       |
| ------------------ | --------------------- | ----------------------------------------------------------- |
| `API_BASE_URL`     | Pages build vars      | the Worker's URL. **Required** — the build fails without it |
| `ALLOW_MOCK_BUILD` | Pages build vars      | only to opt into the catalogue-only export; normally unset  |
| `SESSION_SECRET`   | `wrangler secret put` | the Worker's only secret                                    |

The build then sets `NEXT_PUBLIC_API_BASE_URL`, `API_INTERNAL_URL`,
`STATIC_EXPORT`, `NEXT_PUBLIC_DEMO_MODE=false` and `NEXT_PUBLIC_BACKEND=edge`
itself — see `infrastructure/scripts/build-demo.mjs`. `NEXT_PUBLIC_BACKEND` is
how the front ends know which backend they are on: unset means the NestJS
stack, which really does send email and whose Postgres seed has the documented
credential pair. Setting it by hand is not something a deployment needs to do.

## Storefront (Cloudflare Pages)

| Variable                     | Example (production)                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`   | `https://api.example.com`                                       |
| `NEXT_PUBLIC_STOREFRONT_URL` | `https://www.example.com`                                       |
| `NEXT_PUBLIC_ADMIN_URL`      | `https://admin.example.com`                                     |
| `NEXT_PUBLIC_ASSET_BASE_URL` | `https://assets.example.com` (R2 public bucket / custom domain) |

## Admin (Cloudflare Pages)

Same four variables as the storefront (values identical per environment).

## API + worker (independent backend)

| Variable                                                      | Notes                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                                                    | `production`                                                       |
| `DATABASE_URL`                                                | managed PostgreSQL connection string                               |
| `REDIS_URL`                                                   | managed Redis                                                      |
| `STOREFRONT_URL` / `ADMIN_URL` / `API_URL`                    | public URLs (emails, redirects, webhooks)                          |
| `TRUSTED_ORIGINS`                                             | `https://www.example.com,https://admin.example.com`                |
| `COOKIE_DOMAIN`                                               | `.example.com` when sharing a registrable domain                   |
| `COOKIE_SECURE`                                               | `true`                                                             |
| `COOKIE_SAMESITE`                                             | `lax` (same registrable domain) or `none` (cross-domain)           |
| `TRUST_PROXY`                                                 | `true` behind Cloudflare/load balancer                             |
| `SESSION_SECRET`                                              | long random value — rotate from local default                      |
| `STORAGE_PROVIDER`                                            | `r2`                                                               |
| `S3_ENDPOINT`                                                 | `https://<account-id>.r2.cloudflarestorage.com`                    |
| `S3_PUBLIC_ENDPOINT`                                          | public R2/custom asset domain                                      |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 API token pair; region `auto`                                   |
| `S3_FORCE_PATH_STYLE`                                         | `false` for R2 public URLs via custom domain (see r2-migration.md) |
| `EMAIL_PROVIDER` + `SMTP_*` + `EMAIL_FROM`                    | real SMTP relay                                                    |
| `PAYMENT_PROVIDER`                                            | `stripe`                                                           |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                 | from the Stripe dashboard                                          |
| `CAPTCHA_PROVIDER` / `TURNSTILE_SECRET_KEY`                   | `turnstile` + secret (see turnstile.md)                            |
| `RESERVATION_DURATION_MINUTES`                                | initial default; runtime value lives in admin settings             |
| `RATE_LIMIT_*`                                                | tune for production traffic                                        |
