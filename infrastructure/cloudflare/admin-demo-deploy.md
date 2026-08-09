# Deploying the admin panel demo to Cloudflare Pages

This puts a **clickable admin panel** on a Pages URL with no backend at all. It is a demo build,
not the real back office — read "What this is and is not" before showing it to anyone.

It is a **second, separate Pages project** from the storefront. The storefront project builds
`apps/storefront/out`; this one builds `apps/admin/out`. One project cannot serve both.

## What this is and is not

Cloudflare Pages serves static assets. It cannot run the NestJS API, PostgreSQL, Redis, MinIO or
the BullMQ worker. So the demo build swaps the API for a bundled dataset generated from the shared
catalogue spec (`packages/catalog` — the same one the Prisma seed writes to Postgres), with edits
kept in `localStorage`.

| Works in the demo                                        | Still needs the real backend        |
| -------------------------------------------------------- | ----------------------------------- |
| Every screen loads with realistic data                     | Shared data between users           |
| Dashboard: revenue, AOV, sales by day/brand, low stock     | Real authentication and RBAC        |
| Products list + detail, variants, stock                    | Editing products, orders, campaigns |
| Orders list + detail, items, totals, fulfilment, refunds   | Coupons, returns, reservations      |
| Customers list + detail with order history                 | Media uploads, CSV import/export    |
| **Reviews: full moderation** — approve/reject/hide, reply, | Invoices and packing slips          |
| bulk actions, undo, delete, rating stats                   | Audit trail beyond this browser     |

**Reviews are the slice that fully works**, including bulk actions and undo, and moderating a
review moves the product's rating average exactly as the real API would. Most other writes are
deliberately refused with "not available in the static demo" rather than appearing to save and
silently losing the change.

**The sign-in is not authentication.** Any email and password are accepted; there is no user table
to check against and nothing is encrypted. A banner on the login screen and on every panel page
says so. **Never enter a real password.** The env-driven `SEED_SUPERADMIN_*` account exists only
for the API-backed build and has no effect here.

Data is per-visitor and per-browser. Clearing site data resets everything to the generated
baseline.

## Cloudflare Pages project settings

Create a **new** Pages project from the same Git repository, then set:

| Setting                | Value                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Production branch      | the branch holding this work                                                              |
| Framework preset       | **None**                                                                                  |
| Root directory         | _(leave empty — the repo root, where `pnpm-workspace.yaml` lives)_                        |
| Build command          | `pnpm install --no-frozen-lockfile --filter "@outlet/admin..." && pnpm run build:admin-demo` |
| Build output directory | `apps/admin/out`                                                                          |
| Node version           | 20 or later (`NODE_VERSION` environment variable)                                         |

No environment variables are required: `build:admin-demo` sets `NEXT_PUBLIC_DEMO_MODE=true`
itself, and there is no API to point at.

## Recommended hardening

Even though the data is fake, a page that looks like a back office invites confusion:

- Put the project behind **Cloudflare Access** (Zero Trust) so it is not world-readable.
- Add `X-Robots-Tag: noindex` (see `headers.example`) — search results for a page titled
  "Outlet Admin" are not what you want.
- Keep it on a distinct subdomain from the storefront so nobody mistakes one for the other.

## Building it locally

```bash
pnpm run build:admin-demo
```

Then serve the export exactly as Pages would:

```bash
npx serve apps/admin/out -l 3002
```

## Adding coverage

Endpoint handlers live in `apps/admin/src/lib/demo/router.ts`, the generated dataset in
`apps/admin/src/lib/demo/data.ts`, and per-browser edits in `apps/admin/src/lib/demo/store.ts`.

When adding a handler, match the **exact** response shape the screen expects — bare array vs.
`{ items, total, totalPages }` differs per endpoint, and several pages map over the response
without guarding, so a wrong shape is a blank screen rather than a soft failure. The DTOs in
`packages/types/src/dto.ts` are the reference.

For a fully functional deployment, use Strategy A in [docs/deployment.md](../../docs/deployment.md):
frontends on Pages, API + worker on a container host, managed Postgres and Redis.
