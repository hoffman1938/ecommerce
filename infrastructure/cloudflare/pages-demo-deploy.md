# Deploying the storefront demo to Cloudflare Pages

This is the concrete, working configuration for putting a **browsable storefront**
on Cloudflare Pages. It is a demo build, not the full product — read
"What this is and is not" before using it for anything that matters.

## What this is and is not

Cloudflare Pages serves static assets and edge functions. It cannot run the
NestJS API, PostgreSQL, Redis, MinIO, or the BullMQ worker that this project is
built around. So the demo build swaps the API out for a bundled copy of the
Prisma seed catalog (`apps/storefront/src/lib/demo/`).

The whole customer journey works — browsing, accounts, cart, checkout, orders
and returns — but it works _in the browser_. All state lives in `localStorage`,
private to each visitor and gone when they clear site data.

| Works in the demo                                          | Still needs the real backend    |
| ---------------------------------------------------------- | ------------------------------- |
| Home, campaigns, category, brand, search                   | Cross-customer stock contention |
| Product detail with variants, live stock and SEO metadata  | Durable, shared data            |
| Filtering, sorting, pagination                             | Real payment capture            |
| Cart with the 20-minute reservation countdown              | Email (verification, receipts)  |
| Register, sign in, password reset and change               | The admin panel                 |
| Profile, addresses, wishlist, notification preferences     | Server-enforced authorization   |
| Checkout, the four TEST-\* payment outcomes, order history |                                 |
| Returns with refunds and restocking                        |                                 |

Three deliberate divergences, all because there is no server or worker:

- **Registration verifies immediately** and signs the user in, and password
  reset hands back the link instead of emailing it — there is no mail server.
- **Payment outcomes apply locally** rather than arriving as HMAC-signed
  webhooks. `TEST-DELAYED` stores a timestamp and settles on the next poll.
- **Fulfilment advances on a timer** (~20s to shipped, ~45s to delivered)
  instead of an operator moving it, so returns are reachable in about a minute.

Sign in with `customer@example.local` / `Customer123!`, or register any address.
A banner on every page states all of this so visitors are not misled.

**The "auth" here is not authentication.** It is a user id in `localStorage`
with a non-cryptographic password hash, entirely client-side and user-editable.
The real system uses Argon2id server-side (`packages/auth`). Nothing in the demo
should ever handle a real credential.

For a fully functional deployment, use Strategy A in
[docs/deployment.md](../../docs/deployment.md): frontends on Pages, API + worker
on a container host, managed Postgres and Redis.

## Cloudflare Pages project settings

Create a Pages project from the Git repository, then set:

| Setting                | Value                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Production branch      | the branch holding this work                                                                                                  |
| Framework preset       | **None**                                                                                                                      |
| Root directory         | _(leave empty — the repo root, where `pnpm-workspace.yaml` lives)_                                                            |
| Build command          | `pnpm install --no-frozen-lockfile --filter "@outlet/storefront..." --filter "@outlet/admin..." && pnpm run build:cloudflare` |
| Build output directory | `apps/storefront/out`                                                                                                         |

> **Both filters are required.** `build:cloudflare` also builds the admin panel demo and nests it
> at `/admin` inside the storefront export (see `admin-demo-deploy.md`). `--filter
"@outlet/storefront..."` pulls in the storefront and _its_ dependencies only — the admin is not
> one of them, so omitting the second filter fails the build at the admin step.

Environment variables (Production **and** Preview):

| Name                    | Value                                 |
| ----------------------- | ------------------------------------- |
| `NEXT_PUBLIC_DEMO_MODE` | `true`                                |
| `NODE_VERSION`          | `20` (also pinned by `.node-version`) |

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
- `src/lib/demo/` — a browser-side stand-in for the API, mirroring its routes
  and `@outlet/types` DTOs:
  - `data.ts` — the Prisma seed as plain TypeScript
  - `queries.ts` — catalog reads, filtering, campaign pricing, live stock
  - `cart.ts` — cart and the 20-minute reservations
  - `store.ts` — persistent state (accounts, orders, stock) in `localStorage`
  - `auth.ts` / `account.ts` / `orders.ts` — sessions, account area, checkout,
    payments, order fulfilment and returns
  - `router.ts` — dispatches an HTTP method and path to the above
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
