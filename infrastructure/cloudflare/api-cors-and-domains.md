# API CORS, cookies, and custom domains

The API never assumes it shares a domain with the frontends. Everything below is environment
configuration (`packages/config`), not code.

## CORS

`TRUSTED_ORIGINS` is a comma-separated allow-list applied with `credentials: true`:

```env
TRUSTED_ORIGINS=https://www.example.com,https://admin.example.com
```

Preview deployments: add the exact Pages preview origins you want to allow. Avoid wildcards —
credentials mode requires exact origins anyway.

## Cookies across domains

Sessions and carts use HttpOnly cookies set by the API. Options:

1. **Same registrable domain (recommended):** API at `api.example.com`, frontends at
   `www./admin.example.com` → `COOKIE_DOMAIN=.example.com`, `COOKIE_SAMESITE=lax`,
   `COOKIE_SECURE=true`.
2. **Fully cross-domain:** `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` (browser requirement);
   leave `COOKIE_DOMAIN` empty so cookies are host-only on the API domain.

Behind Cloudflare set `TRUST_PROXY=true` so client IPs (rate limiting, audit logs) come from the
forwarded headers.

## Custom domains

- `www.example.com` → storefront Pages project custom domain
- `admin.example.com` → admin Pages project custom domain (consider Cloudflare Access on top)
- `api.example.com` → DNS to the backend host (proxied through Cloudflare for WAF/TLS)
- `assets.example.com` → R2 bucket custom domain (see r2-migration.md)

Update the corresponding env vars after wiring domains: `NEXT_PUBLIC_API_BASE_URL`,
`STOREFRONT_URL`, `ADMIN_URL`, `API_URL`, `NEXT_PUBLIC_ASSET_BASE_URL`.

## Webhooks

Stripe must point at the public API domain: `https://api.example.com/payments/webhook/stripe`.
The mock provider's endpoint stays enabled only while `PAYMENT_PROVIDER=mock` — production sets
`stripe`, which disables mock webhook handling automatically.

## Cache policy

- API responses are dynamic — bypass cache for `api.example.com` (Cache Rule: bypass).
- Static assets cache aggressively on the asset domain (immutable keys).
- Pages handles HTML caching through the Next.js adapter defaults.
