## Demo: https://ecommerce-135.pages.dev/

# Outlet Marketplace

An outlet e-commerce platform (inspired by the business model of Lounge by Zalando):
limited-stock brand deals, time-limited campaigns, a concurrency-safe 20-minute inventory
reservation system, a full customer storefront, and a complete role-based administration panel.
Everything runs on free infrastructure — locally with Docker, or deployed on Cloudflare's free
tier. No payment provider, no email provider, no paid service anywhere.

## Two stacks

The repository carries two complete backends. They read the same catalogue and implement the
same business rules; they differ in where they run.

|                 | **Cloudflare demo** (`apps/edge`) | **Local stack** (`apps/api`)  |
| --------------- | --------------------------------- | ----------------------------- |
| Runtime         | Cloudflare Workers                | Node / NestJS                 |
| Database        | Cloudflare D1 (SQLite)            | PostgreSQL via Prisma         |
| Storage         | Cloudflare R2                     | MinIO (S3)                    |
| Background work | Worker cron trigger               | BullMQ on Redis               |
| Payments        | Demo only — no provider exists    | Mock provider with test cards |
| This is what    | the deployed demo runs on         | you develop against locally   |

Both serve the same Next.js storefront and admin panel, which talk to whichever API their
`NEXT_PUBLIC_API_BASE_URL` points at.

| Layer              | Technology                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| Monorepo           | pnpm workspaces (modular monolith)                                          |
| Demo API           | Cloudflare Workers + Hono on D1 and R2                                      |
| Local API          | NestJS + Prisma + PostgreSQL, Swagger at `/docs`                            |
| Worker             | Node + BullMQ (Redis) behind a swappable queue interface                    |
| Storefront / Admin | Next.js 14 (App Router) + Tailwind + TanStack Query, Cloudflare-Pages-ready |
| Local services     | PostgreSQL, Redis, MinIO (S3), Mailpit (SMTP), mock payment provider        |

---

## The Cloudflare demo

### Demo accounts

Passwords are **not** in this repository. They are set when the database is seeded:

```bash
SEED_ADMIN_PASSWORD='…' SEED_CUSTOMER_PASSWORD='…' pnpm db:seed:demo
```

Leave those variables unset and the seed generates strong ones and prints them once — they are
never written to disk. Whoever runs the seed holds the passwords and shares them out of band.

| Account       | Email                 | Password                 |
| ------------- | --------------------- | ------------------------ |
| Administrator | `admin@demo.local`    | `SEED_ADMIN_PASSWORD`    |
| Customer      | `customer@demo.local` | `SEED_CUSTOMER_PASSWORD` |

Eight more staff accounts exist, one per role, all on `SEED_CUSTOMER_PASSWORD`:
`catalog@`, `inventory@`, `orders@`, `support@`, `moderator@`, `marketing@`, `finance@` and
`analyst@demo.local`. Signing in as one is the quickest way to see role-based access working —
the Inventory Manager can move stock and gets a `403` from the coupons screen.

Eleven further customer accounts carry the seeded order history.

### Demo coupons

| Code        | Effect                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `WELCOME10` | 10% off, first order only, once per customer                                    |
| `SALE15`    | 15% off orders over €50, capped at €40                                          |
| `DEMO20`    | 20% off, capped at €30                                                          |
| `SAVE20`    | €20 off orders over €100                                                        |
| `FREESHIP`  | Free standard delivery on orders over €25                                       |
| `ASTER15`   | 15% off Aster products only, capped at €50                                      |
| `EXPIRED10` | Deliberately expired — so there is something for "what happens with a bad code" |

### Commands

```bash
pnpm dev:edge                 # the Worker locally (wrangler dev)
pnpm db:migrate:demo          # apply D1 migrations, local
pnpm db:seed:demo             # seed the local D1 database (idempotent)
pnpm db:reset-demo            # wipe and re-seed the local D1 database
pnpm --filter @outlet/edge test    # 147 tests: journeys, security, catalogue, admin panel
API_BASE_URL=… pnpm build:cloudflare   # the static export Pages serves
pnpm deploy:edge              # deploy the Worker
```

`build:cloudflare` needs `API_BASE_URL` — the Worker's URL — and fails without
it rather than quietly producing the catalogue-only export, which browses but
has no database behind it. See
[infrastructure/cloudflare/d1-and-r2.md](infrastructure/cloudflare/d1-and-r2.md).

The remote equivalents are `db:migrate:demo:remote` and `db:seed:demo:remote`. Resetting a
remote database additionally requires `ENVIRONMENT` to identify itself as a demo one _and_
`--yes-really`, so a production database is unreachable from that command.

### Deploying

See [infrastructure/cloudflare/d1-and-r2.md](infrastructure/cloudflare/d1-and-r2.md) for the
full walkthrough: create D1/R2/KV, set `SESSION_SECRET`, migrate, seed, deploy the Worker, point
Pages at it, and add the Pages origin to `ALLOWED_ORIGINS`.

### Demo payment

There is no payment provider, no API key, and no card field. Pressing **Place demo order**
creates a real order, reduces real stock, writes a `payments` row with `provider = 'demo'` and
marks it paid. No code path in this deployment could move money even if a credential were
supplied. See [SECURITY.md](SECURITY.md).

---

## The local Docker stack

### Prerequisites

- Docker Desktop (or any Docker Engine with Compose v2)
- Node.js ≥ 22.5 and pnpm ≥ 9 (`corepack enable`) — only needed for host-side development and
  tests. 22.5 is the floor because the demo test suite runs against `node:sqlite`.

### Quick start

```bash
git clone <this repo>
cd <repo>
cp .env.example .env       # safe local defaults; optional — compose has fallbacks
docker compose up --build  # first run takes a few minutes
```

The `migrate` one-shot container applies migrations and inserts idempotent seed data
automatically. Then open:

| Service                        | URL                                      |
| ------------------------------ | ---------------------------------------- |
| Customer storefront            | http://localhost:3000                    |
| Admin panel                    | http://localhost:3001                    |
| Backend API                    | http://localhost:4000                    |
| API documentation (Swagger)    | http://localhost:4000/docs               |
| Mailpit (all local email)      | http://localhost:8025                    |
| MinIO console (object storage) | http://localhost:9001 (minio / minio123) |
| PostgreSQL                     | localhost:5432 (outlet / outlet)         |
| Redis                          | localhost:6379                           |

### Local test credentials (Docker stack only — never use in production)

```text
Super Admin:  admin@example.local    / Admin123!
Customer:     customer@example.local / Customer123!
```

Additional role accounts (all `Admin123!`): catalog@, inventory@, orders@, support@,
marketing@, finance@, analyst@example.local.

These reach a PostgreSQL database listening on localhost and nothing else. The deployed demo
takes its passwords from the environment instead — see the demo accounts section above.

Coupons are the same set the demo uses, listed above.

### Test payments (local stack only)

Against the local NestJS API, checkout redirects to a simulated payment page with a card form.
The Cloudflare demo has no such page — it places the order directly, with no card field at all.

**No real payment is ever taken, no card number is transmitted or stored** — the number is
resolved to an outcome in the browser and only the outcome code is sent. Use these test cards:

| Card                  | Outcome                      |
| --------------------- | ---------------------------- |
| `4242 4242 4242 4242` | Succeeds                     |
| `4000 0000 0000 0259` | Delayed confirmation (~10 s) |
| `4000 0000 0000 0002` | Declined                     |
| `4000 0000 0000 9995` | Insufficient funds           |
| `4000 0000 0000 0069` | Expired card                 |
| `4000 0000 0000 3220` | 3-D Secure fails             |
| `4000 0000 0000 0119` | Provider unavailable         |
| `4000 0000 0000 0127` | Network timeout              |

Any other well-formed number is rejected as an invalid card. A "force an outcome directly" section
on the same page skips the form. Against the real API all outcomes are delivered as HMAC-signed
webhooks through the same verification and duplicate-suppression path a real provider would use.
Set `PAYMENT_PROVIDER=stripe` (with real keys) to switch to the Stripe adapter — never required
locally.

### QA simulation sandbox

The storefront ships a control center at **`/qa`** (linked from the sandbox banner) for driving the
simulated business without waiting. Everything it does is browser-local — no request leaves the
page, no money moves, nothing is sent to anyone.

- **Time travel** — `+1h / +1d / +3d / +7d`. Ages reservations, campaign windows and fulfilment
  together, so reservation expiry and campaign endings are reachable instantly.
- **Orders** — force any fulfilment stage (`PAID → PROCESSING → PACKED → SHIPPED → DELIVERED`),
  fail a delivery, or cancel. Each transition writes a timeline entry, an audit event, an in-app
  notification and a simulated email.
- **Returns & refunds** — walk a return through `REQUESTED → APPROVED → RECEIVED → COMPLETED`, or
  reject it. The refund, restock and order status change only at the final step. Refund ids look
  like `SIM-REF-2026-00001`.
- **Inventory** — set any variant's availability to reproduce low-stock and sold-out states.
- **Event log** — every state change the sandbox has recorded.
- **Reset** — clear orders, inventory, inbox, events, cart, wishlist, or everything.
- **Scenarios** — eight step-by-step routes covering successful purchase, failed payment and retry,
  selling out mid-session, cancellation, return and refund, failed delivery, promo validation and
  reservation expiry.

Customers see the simulated notifications and emails at **`/account/inbox`**; tracking numbers look
like `SIM-GEO-100001` and order numbers like `OUT-100001`.

## Catalogue structure

The shop is browsed through a three-level tree — department → category → subcategory — defined once
in `packages/catalog/src/taxonomy.ts` and consumed by the Prisma seed, the API, the storefront and
the admin panel alike. URLs read `/shop/women/clothing/dresses`; `/category/:slug` still resolves
for older links.

The tree mirrors the way a general fashion retailer organises one: four departments, fifteen
categories and a hundred and twenty-two subcategories, from `women/clothing/dresses` down to
`men/accessories/cufflinks`.

Nothing about the navigation is hardcoded in the front ends. **A category reaches a customer when
it is active and its ancestors are active — and nothing else.** Emptiness does not hide anything:
a category with no stock stays on the menu and shows an empty listing, exactly as it would in a
shop that has sold out of a line it still intends to carry. Visibility is a decision somebody
makes, not a side effect of inventory.

**Catalog → Categories** in the admin panel shows the whole tree — every row, including empty ones
— with `Hidden` and `Empty` reported separately. `Hidden` means somebody switched it off; `Empty`
is a note for whoever manages stock and changes nothing about what shoppers see. Each row carries
product counts, ordering, a Hide/Unhide switch, and a delete flow that will not let products be
orphaned. See [docs/architecture.md](docs/architecture.md#category-tree-and-visibility-documented-decision).

Size guides come from a single transcribed dataset covering Men, Women, Kids and Unisex across
t-shirts, shirts and jeans/trousers, in every system it publishes (US, UK, EU, IT, FR, JP,
International). The chart shown is the one for the product's own category and audience, and
products whose category has no sizing — footwear, bags, accessories — show no size guide at all.

## Product imagery

The catalogue ships no photography. Every product, category, brand and campaign
image is generated from `packages/catalog/src/artwork.ts` — a studio still per
colourway, in three views (`front`, `back` and a fabric `detail` macro), lit and
framed identically. Two properties are why generated art beats stock
photography here: each colourway is exactly the colour the variant claims, and
nothing is licensed from anyone.

`pnpm --filter @outlet/storefront artwork` writes them to
`apps/storefront/public/artwork/` (gitignored, ~3 MB, 346 files). `predev` and
`prebuild` run it automatically, so it is not a step you have to remember. The
API-backed stack uploads the same SVGs to MinIO/S3 during seeding instead.

Swapping in real photography later means replacing the URLs the seed writes —
nothing downstream cares where an image came from.

## Commands

```bash
pnpm install              # install workspace dependencies
pnpm build                # build all packages and apps
pnpm lint                 # lint all workspaces
pnpm typecheck            # typecheck all workspaces
pnpm test                 # unit tests across every workspace

# Cloudflare demo (Workers + D1 + R2)
pnpm dev:edge             # the Worker locally
pnpm db:migrate:demo      # apply D1 migrations
pnpm db:seed:demo         # seed D1 (idempotent)
pnpm db:reset-demo        # wipe and re-seed D1
pnpm build:cloudflare     # the static export Pages serves
pnpm deploy:edge          # deploy the Worker

# Local Docker stack (NestJS + PostgreSQL)
pnpm local:up             # docker compose up --build -d
pnpm local:reset          # stop containers, wipe volumes, restart, re-migrate, re-seed
pnpm db:migrate           # prisma migrate deploy
pnpm db:seed              # idempotent seed
pnpm test:integration     # API integration tests incl. the 100-way concurrency test
                          #   (requires: docker compose up -d postgres redis)
pnpm test:e2e             # Playwright end-to-end tests (requires the full stack running)
```

## Repository layout

```text
apps/          edge (Cloudflare Worker API) · api (NestJS) · worker (BullMQ) ·
               storefront (Next.js) · admin (Next.js)
packages/      catalog (shared product data + generated artwork) · database (Prisma) ·
               domain (pure logic) · auth · payments · storage · email · queue · ui ·
               types · validation · config · eslint/tsconfig presets
infrastructure/ docker · cloudflare (deployment guides) · scripts
e2e/           Playwright test suite
docs/          architecture, local setup, deployment strategies
```

`apps/edge` holds the demo's whole backend: `migrations/` is the D1 schema,
`scripts/` builds and applies the seed, `src/` is the API, and `test/` walks the customer
and administrator journeys against both.

## Documentation

- [ABOUT.md](ABOUT.md) — what this project is, what it demonstrates and its limits

- [SECURITY.md](SECURITY.md) — how secrets are handled, what the demo deliberately lacks,
  and the security properties with the tests that hold them up
- [infrastructure/cloudflare/d1-and-r2.md](infrastructure/cloudflare/d1-and-r2.md) — deploying
  the demo on Workers, D1 and R2, start to finish
- [docs/architecture.md](docs/architecture.md) — architecture, key decisions, reservation
  algorithm, state machines, permission model, documented assumptions
- [docs/local-setup.md](docs/local-setup.md) — detailed setup, acceptance walkthrough,
  troubleshooting
- [docs/deployment.md](docs/deployment.md) — production strategies for the NestJS stack
- [infrastructure/cloudflare/](infrastructure/cloudflare/) — Pages build notes, env vars, R2
  migration, Turnstile, CORS/custom domains
