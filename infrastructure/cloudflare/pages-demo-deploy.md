# Deploying the storefront demo to Cloudflare Pages

This is the concrete, working configuration for putting a **browsable storefront**
on Cloudflare Pages. It is a demo build, not the full product — read
"What this is and is not" before using it for anything that matters.

## What this is and is not

Cloudflare Pages serves static assets and edge functions. It cannot run the
NestJS API, PostgreSQL, Redis, MinIO, or the BullMQ worker that this project is
built around. So the demo build swaps the API out for a bundled copy of the
Prisma seed catalog (`apps/storefront/src/lib/demo/`).

| Works in the demo | Needs the real backend |
| --- | --- |
| Home, campaigns, category, brand, search pages | Register / sign in / sessions |
| Product detail with variants, stock and SEO metadata | Checkout and payments |
| Filtering, sorting, pagination | Orders, returns, wishlist |
| Cart with the 20-minute reservation countdown | Cross-customer stock contention |
| Content pages (privacy, terms, FAQ, …) | The admin panel |

The cart is per-browser (`localStorage`), so the concurrency guarantees the real
reservation service exists to provide cannot be demonstrated here. A banner on
every page states this so visitors are not misled.

For a fully functional deployment, use Strategy A in
[docs/deployment.md](../../docs/deployment.md): frontends on Pages, API + worker
on a container host, managed Postgres and Redis.

## Cloudflare Pages project settings

Create a Pages project from the Git repository, then set:

| Setting | Value |
| --- | --- |
| Production branch | the branch holding this work |
| Framework preset | **None** |
| Root directory | *(leave empty — the repo root, where `pnpm-workspace.yaml` lives)* |
| Build command | `pnpm install --no-frozen-lockfile --filter "@outlet/storefront..." && pnpm run build:cloudflare` |
| Build output directory | `apps/storefront/out` |

Environment variables (Production **and** Preview):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |
| `NODE_VERSION` | `20` (also pinned by `.node-version`) |

`build:cloudflare` also sets `NEXT_PUBLIC_DEMO_MODE=true` inline, so the build is
correct even if the dashboard variable is missed. Setting it explicitly keeps
preview deployments consistent.

### Why the build command looks like that

- `--no-frozen-lockfile` — no `pnpm-lock.yaml` is committed, so pnpm must resolve
  fresh. Commit a lockfile and you can drop the flag (and should).
- `--filter "@outlet/storefront..."` — installs only the storefront and the three
  workspace packages it needs (`types`, `ui`, `validation`). Without it, pnpm
  also installs `apps/api` and `packages/auth`, which pull in Prisma and the
  native `argon2` build — slow at best, a failed build at worst, and none of it
  is used by a static export.
- `build:cloudflare` (root `package.json`) builds those three packages to their
  `dist/` output before `next build`, because they are consumed as compiled
  packages rather than as source.

## What changed in the app to make this possible

- `apps/storefront/next.config.mjs` — `output: 'export'` when
  `NEXT_PUBLIC_DEMO_MODE=true`, otherwise the original `'standalone'` for Docker.
  The Docker build is unaffected.
- `src/lib/demo/` — the seed catalog as plain TypeScript, plus query, cart and
  routing layers that mirror the real API's public endpoints and DTOs.
- `src/lib/api.ts` / `src/lib/server-api.ts` — in demo mode these resolve against
  `src/lib/demo` instead of issuing HTTP requests. With the flag unset both
  behave exactly as before.
- Listing pages read filters from the URL on the client (`useSearchParams`)
  rather than from server-side `searchParams`, which a static export has no
  request to provide.
- Campaign views render on the client so the active/upcoming split and the
  countdowns stay correct however long ago the site was built.
- Every dynamic route now has `generateStaticParams`, which a static export
  requires. `/account/orders/[id]` returns an empty set — those ids only exist
  in a database.

## Keeping the demo in sync

`src/lib/demo/data.ts` is a hand-maintained mirror of
`packages/database/src/seed/`. If the seed changes, update it, or the demo will
drift from what `docker compose up` shows.

## Local verification

The demo build can be checked without Docker or any backend:

```bash
pnpm install --no-frozen-lockfile --filter "@outlet/storefront..."
```

```bash
pnpm run build:cloudflare
```

The static site lands in `apps/storefront/out`. Serve it with any static file
server to confirm before pushing.
