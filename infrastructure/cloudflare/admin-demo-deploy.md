# Deploying the admin panel demo to Cloudflare Pages

This puts a **clickable admin panel** on a Pages URL with no backend at all. It is a demo build,
not the real back office — read "What this is and is not" before showing it to anyone.

**By default it ships with the storefront, not separately.** `pnpm run build:cloudflare` builds the
storefront export, then builds the panel with `ADMIN_BASE_PATH=/admin` and copies it into
`apps/storefront/out/admin`. One Pages project, one domain, and the panel is at
`https://<your-site>.pages.dev/admin`.

Deploying it as its own Pages project is still supported — see "Standalone project" at the end.

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

## Cloudflare Pages settings (shipped with the storefront)

Use the **existing** storefront Pages project. Only the build command changes:

| Setting                | Value                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Build command          | `pnpm install --no-frozen-lockfile --filter "@outlet/storefront..." --filter "@outlet/admin..." && pnpm run build:cloudflare` |
| Build output directory | `apps/storefront/out` _(unchanged)_                                                                                          |

**The second `--filter` is mandatory.** `--filter "@outlet/storefront..."` installs the storefront
and *its* dependencies; the admin is not one of them, so without `--filter "@outlet/admin..."` the
build fails at the admin step with missing modules.

No environment variables are required: the build script sets `NEXT_PUBLIC_DEMO_MODE=true` and
`ADMIN_BASE_PATH=/admin` itself, and there is no API to point at.

The two exports have separate `_next` directories and no overlapping routes, so nesting cannot
clobber storefront files. The storefront has no `/admin` route of its own.

## Recommended hardening

Even though the data is fake, a page that looks like a back office invites confusion:

- Put the project behind **Cloudflare Access** (Zero Trust) so it is not world-readable.
- Add `X-Robots-Tag: noindex` (see `headers.example`) — search results for a page titled
  "Outlet Admin" are not what you want.
- Keep it on a distinct subdomain from the storefront so nobody mistakes one for the other.

## Building it locally

Both together, exactly as Pages does it:

```bash
pnpm run build:cloudflare
```

```bash
npx serve apps/storefront/out -l 3005
```

Storefront at `http://localhost:3005`, panel at `http://localhost:3005/admin`.

## Standalone project

To give the panel its own domain instead, create a second Pages project with:

| Setting                | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Root directory         | _(empty — the repo root)_                                                                   |
| Build command          | `pnpm install --no-frozen-lockfile --filter "@outlet/admin..." && pnpm run build:admin-demo` |
| Build output directory | `apps/admin/out`                                                                            |

`build:admin-demo` leaves `ADMIN_BASE_PATH` unset, so the panel serves from the domain root.
Locally: `pnpm run build:admin-demo && npx serve apps/admin/out -l 3002`.

## Adding coverage

Endpoint handlers live in `apps/admin/src/lib/demo/router.ts`, the generated dataset in
`apps/admin/src/lib/demo/data.ts`, and per-browser edits in `apps/admin/src/lib/demo/store.ts`.

When adding a handler, match the **exact** response shape the screen expects — bare array vs.
`{ items, total, totalPages }` differs per endpoint, and several pages map over the response
without guarding, so a wrong shape is a blank screen rather than a soft failure. The DTOs in
`packages/types/src/dto.ts` are the reference.

For a fully functional deployment, use Strategy A in [docs/deployment.md](../../docs/deployment.md):
frontends on Pages, API + worker on a container host, managed Postgres and Redis.
