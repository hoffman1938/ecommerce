## Demo: ecommerce-135.pages.dev
# Outlet Marketplace — local-first MVP

A production-ready, local-first outlet e-commerce platform (inspired by the business model of
Lounge by Zalando): limited-stock brand deals, time-limited campaigns, a concurrency-safe
20-minute inventory reservation system, mock payments, a full customer storefront, and a complete
role-based administration panel. Everything runs locally with zero paid services.

## Stack

| Layer              | Technology                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| Monorepo           | pnpm workspaces (modular monolith)                                          |
| API                | NestJS + Prisma + PostgreSQL, Swagger at `/docs`                            |
| Worker             | Node + BullMQ (Redis) behind a swappable queue interface                    |
| Storefront / Admin | Next.js 14 (App Router) + Tailwind + TanStack Query, Cloudflare-Pages-ready |
| Local services     | PostgreSQL, Redis, MinIO (S3), Mailpit (SMTP), mock payment provider        |

## Prerequisites

- Docker Desktop (or any Docker Engine with Compose v2)
- Node.js ≥ 20 and pnpm ≥ 9 (`corepack enable`) — only needed for host-side development and tests

## Quick start

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

## Local test credentials (seed data only — never use in production)

```text
Super Admin:  admin@example.local    / Admin123!
Customer:     customer@example.local / Customer123!
```

Additional role accounts (all `Admin123!`): catalog@, inventory@, orders@, support@,
marketing@, finance@, analyst@example.local.

Coupons: `WELCOME10` (10 %, first order), `SAVE20` (20 € off from 100 €), `NIKE15` (15 % on Nike).

## Test payments

Checkout redirects to a simulated payment page with a card form. **No real payment is ever taken,
no card number is transmitted or stored** — the number is resolved to an outcome in the browser and
only the outcome code is sent. Use these test cards:

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

## QA simulation sandbox

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
pnpm local:up             # docker compose up --build -d
pnpm local:reset          # stop containers, wipe volumes, restart, re-migrate, re-seed
pnpm db:migrate           # prisma migrate deploy
pnpm db:seed              # idempotent seed
pnpm build                # build all packages and apps
pnpm lint                 # lint all workspaces
pnpm typecheck            # typecheck all workspaces
pnpm test                 # unit tests (domain logic and more)
pnpm test:integration     # API integration tests incl. the 100-way concurrency test
                          #   (requires: docker compose up -d postgres redis)
pnpm test:e2e             # Playwright end-to-end tests (requires the full stack running)
```

## Repository layout

```text
apps/          api (NestJS) · worker (BullMQ) · storefront (Next.js) · admin (Next.js)
packages/      catalog (shared product data + generated artwork) · database (Prisma) ·
               domain (pure logic) · auth · payments · storage · email · queue · ui ·
               types · validation · config · eslint/tsconfig presets
infrastructure/ docker · cloudflare (future-deployment notes) · scripts
e2e/           Playwright test suite
docs/          architecture, local setup, deployment strategies
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — architecture, key decisions, reservation
  algorithm, state machines, permission model, documented assumptions
- [docs/local-setup.md](docs/local-setup.md) — detailed setup, acceptance walkthrough,
  troubleshooting
- [docs/deployment.md](docs/deployment.md) — future production strategies (Cloudflare Pages +
  independent backend, or deeper Cloudflare migration)
- [infrastructure/cloudflare/](infrastructure/cloudflare/) — Pages build notes, env vars, R2
  migration, Turnstile, CORS/custom domains

The original product specification is preserved in [mainPrompt.txt](mainPrompt.txt).
