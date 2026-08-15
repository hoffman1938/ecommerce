# Deploying the demo on Workers, D1 and R2

This is the deployment the demo actually runs on:

```text
GitHub (public)  →  Cloudflare Pages   →  storefront + /admin (static export)
                    Cloudflare Worker  →  the API
                    Cloudflare D1      →  the database
                    Cloudflare R2      →  product imagery
                    Cloudflare KV      →  rate-limit counters
```

Everything below is on Cloudflare's free tier. No paid service is required and
none is used.

The older notes in this directory describe the earlier arrangement — a static
export with the catalogue bundled into the browser. That still works as a
fallback (see the end of this file), but it has no database behind it, so
nothing can be bought.

---

## 1. Create the resources

You need `wrangler` authenticated (`pnpm exec wrangler login`) and nothing else.

```bash
cd apps/edge

pnpm exec wrangler d1 create outlet-demo
pnpm exec wrangler r2 bucket create outlet-demo-media
pnpm exec wrangler kv namespace create RATE_LIMIT
```

Each prints an id. Put them into `apps/edge/wrangler.toml`, replacing the
`REPLACE_WITH_…` placeholders:

```toml
[[d1_databases]]
database_id = "…"       # from `d1 create`

[[kv_namespaces]]
id = "…"                # from `kv namespace create`
```

These ids are **not credentials** — reaching the resources they name needs a
Cloudflare API token, which never goes in a file. They are left as placeholders
in the repository only so a fork cannot accidentally write to your database.

---

## 2. Set the Worker's secrets

```bash
cd apps/edge

# Keys the HMAC that hashes session tokens. The Worker refuses to start
# without it outside development.
pnpm exec wrangler secret put SESSION_SECRET       # openssl rand -base64 32
```

That is the only secret the Worker needs. Seed passwords are not Worker
secrets — the seed runs on your machine and the Worker never sees them.

---

## 3. Migrate and seed

```bash
# From the repository root.
pnpm db:migrate:demo:remote                        # applies apps/edge/migrations
SEED_ADMIN_PASSWORD=… SEED_CUSTOMER_PASSWORD=… pnpm db:seed:demo:remote
```

Leave the password variables unset and the seed generates strong ones and
prints them once. They are never written to disk.

The seed is idempotent: running it twice adds nothing.

Optionally push the artwork into R2. This is a performance change only — the
Worker renders the same images on the fly for any key the bucket does not
hold, so the storefront has working imagery either way:

```bash
pnpm --filter @outlet/edge media:upload:remote
```

---

## 4. Deploy the Worker

```bash
pnpm deploy:edge
```

Note the URL it prints — `https://outlet-demo-api.<subdomain>.workers.dev`.
Check it:

```bash
curl https://outlet-demo-api.<subdomain>.workers.dev/api/health
```

A healthy response reports `"status": "ok"` and a non-zero `activeProducts`.
`"catalogue": "empty"` means the migration ran but the seed did not.

---

## 5. Deploy the frontend to Pages

In the Pages project:

| Setting          | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Build command    | `pnpm install --no-frozen-lockfile && pnpm build:cloudflare` |
| Output directory | `apps/storefront/out`                                        |
| Node version     | `22`                                                         |

Add one build environment variable:

| Variable       | Value                      |
| -------------- | -------------------------- |
| `API_BASE_URL` | the Worker URL from step 4 |

With it set, the build pre-renders pages against the Worker — so the deployed
HTML ships with real catalogue data — and the client talks to it live
afterwards.

**Without it the build fails.** That is deliberate. The catalogue-only fallback
produces a site that looks finished and is not: its admin panel accepts any
password and every write reports that it needs a database. A published Pages
deployment that had quietly landed there is what this check exists to prevent —
the build used to warn and continue, and nobody reads the log of a build that
succeeded. If you really do want the catalogue-only export, ask for it with
`ALLOW_MOCK_BUILD=true`.

---

## 6. Close the loop on CORS

The Worker only accepts credentialed requests from origins it has been told
about. After the first Pages deploy, put its URL into `ALLOWED_ORIGINS`:

```toml
# apps/edge/wrangler.toml
[env.production.vars]
ALLOWED_ORIGINS = "https://your-project.pages.dev"
```

then `pnpm deploy:edge` again.

This is not only CORS. The same list is what the CSRF check validates the
request `Origin` against, so a missing entry shows up as `403` on every write,
not merely as a browser console warning. Include preview domains if you want
preview deployments to work; each is a separate origin.

---

## What runs where

| Piece              | Where                         | Why                                                                       |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------- |
| Storefront + admin | Pages, static export          | No server rendering at request time, so nothing to keep warm              |
| API                | Worker (`apps/edge`)          | The only thing holding credentials                                        |
| Data               | D1                            | SQLite; see `apps/edge/migrations/0001_init.sql`                          |
| Images             | R2, served through the Worker | Keeps the bucket private and the keys validated                           |
| Rate limits        | KV                            | Free, and the limiter fails open if it is absent                          |
| Reservation expiry | Worker cron, every 5 minutes  | The only background job; a Queue would be infrastructure for its own sake |

## R2 layout

```text
products/{product-slug}/{colour}-{front|back|detail}.svg
campaigns/{campaign-slug}.svg
categories/{category-slug}.svg
brands/{brand-slug}.svg
uploads/{generated-id}.{jpg|png|webp}      # admin uploads
```

The first four are generated from the shared catalogue and are the keys the
seed writes into `product_images.objectKey`. `uploads/` keys are generated
server-side at upload time; a client never supplies a path.

Swapping in real photography later means replacing the objects and keeping the
keys. Nothing downstream cares where an image came from.

---

## The fallback: a build with no backend

`ALLOW_MOCK_BUILD=true` with no `API_BASE_URL` produces the older
bundled-catalogue export. It browses, but it has no database: sign-in, cart and
checkout do not work, and the admin panel accepts any password because there is
no user table to check one against. It is useful for a preview before the
Worker exists, and for nothing else — never publish it as a demo of the
product.

---

## Troubleshooting

**Every write returns 403.** The Pages origin is not in `ALLOWED_ORIGINS`. The
CSRF check rejects the request before the handler runs.

**Sign-in appears to work but the next request is anonymous.** The session
cookie is being dropped. It is `SameSite=None; Secure`, so both the Pages site
and the Worker must be on HTTPS — this will not work over plain HTTP.

**`/api/health` says `"catalogue": "empty"`.** Migrations ran; the seed did
not. Run step 3.

**The Worker returns 500 on every request.** Usually `SESSION_SECRET` is not
set. `wrangler tail` shows the reason; the response deliberately does not.
