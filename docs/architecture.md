# Architecture

## Shape: modular monolith in a monorepo

One deployable API (NestJS), one background worker, and two independent Next.js frontends share
domain logic through workspace packages. No microservices. The API is independently deployable
from the frontends and never assumes a shared domain (configurable CORS, cookie domain/SameSite,
trusted origins, proxy trust).

```text
apps/api         HTTP layer: controllers, guards, services (NestJS, Swagger at /docs)
apps/worker      BullMQ consumers + scheduled sweeps (no HTTP)
apps/storefront  Customer UI (Next.js App Router; public pages SSR, personalized pages client-side)
apps/admin       Back-office UI (Next.js, permission-aware navigation)

packages/domain      Pure business rules: pricing, coupons, state machines, reservation policy
packages/database    Prisma schema, migrations, idempotent seed
packages/payments    PaymentProvider interface + MockPaymentProvider + StripePaymentProvider
packages/storage     ObjectStorageProvider + MinIO / S3 / Cloudflare R2 adapters
packages/email       EmailProvider + SMTP (Mailpit) adapter + all templates
packages/queue       QueueClient interface + BullMQ adapter (swappable for Cloudflare Queues)
packages/auth        Argon2 hashing, HMAC'd opaque tokens, captcha provider (none/Turnstile)
packages/config      The environment adapter: every runtime-specific value resolved in one place
packages/validation  Zod schemas shared by API validation and frontend forms
packages/types       Shared enums + API DTO shapes (no Prisma import in browsers)
packages/ui          Small shared React component/formatting kit
```

**Provider-interface rule:** the API and worker depend only on interfaces
(`PaymentProvider`, `ObjectStorageProvider`, `EmailProvider`, `QueueClient`, `CaptchaProvider`).
Environment variables select implementations, so MinIO→R2, Mailpit→real SMTP, mock→Stripe, and
BullMQ→Cloudflare Queues are configuration changes, not rewrites.

## Key technical decisions

| Decision      | Choice                                                                        | Why                                                                               |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ORM           | Prisma                                                                        | Typed client, explicit SQL escape hatch for the atomic inventory updates          |
| Auth          | Opaque session tokens in HttpOnly cookies, HMAC-hashed at rest                | Revocable server-side sessions; DB leak exposes no usable tokens; no JWT footguns |
| Money         | Integer minor units everywhere (`Int`), EUR default                           | No floating point; `packages/domain/money.ts` is the only formatter               |
| Tax           | Prices are VAT-inclusive; `tax_rate_bps` setting derives the included portion | Standard EU display model; documented assumption                                  |
| Validation    | Zod end-to-end                                                                | Same schema powers API rejection and frontend forms                               |
| Search        | PostgreSQL (one SQL id-selection query behind `CatalogService`)               | MVP-sufficient; the service boundary is the future Meilisearch/OpenSearch seam    |
| Frontends     | Client-side data fetching for personalized state; SSR for public/SEO pages    | Keeps HttpOnly cookies working cross-port and stays static-friendly for Pages     |
| Rate limiting | @nestjs/throttler with stricter auth limits                                   | Configurable via env                                                              |

## Inventory model (documented decision)

`onHandQuantity` counts physically sellable units currently in the warehouse — sold and damaged
units are already removed from it. Therefore:

```text
available = onHandQuantity - reservedQuantity
```

`soldQuantity`, `damagedQuantity`, `returnedQuantity` are lifetime counters for reporting.
Database CHECK constraints enforce: all quantities ≥ 0 and `reserved ≤ onHand` — negative stock
is impossible at the database level regardless of application bugs. Every stock change writes an
`InventoryMovement` (actor, previous, new, difference, reason, timestamp).

## The reservation algorithm

PostgreSQL is authoritative; Redis/BullMQ only schedules. Server clock decides expiry; frontend
timers are cosmetic.

**Acquire** (add to cart), inside one transaction:

```sql
UPDATE inventory_balances
SET "reservedQuantity" = "reservedQuantity" + :qty, ...
WHERE "variantId" = :variant
  AND ("onHandQuantity" - "reservedQuantity") >= :qty;
-- 0 rows affected → OUT_OF_STOCK (409). Two buyers of the final unit can never both match.
```

Then the reservation row is created with `expiresAt = now + duration` (duration comes from the
admin-editable `reservation_duration_minutes` setting, default 20). A delayed BullMQ job with a
stable `jobId` is enqueued for the deadline as an optimization only.

**Release** (expiry/cancel) is idempotent: a status-guarded `UPDATE ... WHERE status IN
(ACTIVE, CHECKOUT_STARTED, PAYMENT_PROCESSING)` flips the row exactly once; only the winner
returns stock and deletes the cart line. The API's lazy checks (cart load/update, checkout start,
payment) and the worker (per-reservation job + 30 s sweep) can race harmlessly. The reservation
state machine has no exit from `EXPIRED`, so a delayed worker can never resurrect or double-use a
reservation.

**No extension policy:** refresh, cart reopen, checkout start, page changes, and login never move
`expiresAt`. Login migrates the anonymous cart's reservations to the user cart with their original
deadlines.

**Convert** (payment success), inside one transaction: live reservations become sales
(`reserved -= q, onHand -= q, sold += q`); lapsed ones attempt a direct conditional re-acquisition
(`available >= q`). If any line cannot be secured the transaction rolls back and the **late-payment
policy** applies: the payment is auto-refunded in full, the order is cancelled with an explicit
note, and the customer is emailed. Overselling is never silent — it is impossible.

## Payment pipeline

- Orders are only marked paid by **verified webhooks** — never by a browser redirect. The result
  page merely polls.
- The mock provider signs payloads with HMAC-SHA256; the Stripe adapter uses Stripe's signature
  verification. Both normalize into one `VerifiedPaymentEvent`.
- Exactly-once processing: a unique `(provider, providerEventId)` constraint on `payment_events`
  suppresses duplicate deliveries; the local simulator uses stable event ids so pressing a test
  button twice genuinely exercises the dedupe path.
- `TEST-DELAYED` emits `payment.processing` immediately, then the worker delivers the signed
  success webhook ~10 s later through the real HTTP endpoint.
- Refunds (full/partial) go through `PaymentProvider.refund` with idempotency keys and are capped
  by the refundable remainder; payment status walks `PAID → PARTIALLY_REFUNDED → REFUNDED`.

## State machines

Explicit transition tables in `packages/domain/state-machines.ts` guard every status change
(orders, payments, reservations, returns). Illegal jumps (e.g. `CANCELLED → PAID`,
`EXPIRED → CONVERTED`) throw before any write. Same-status updates are treated as idempotent
replays.

## RBAC

Roles aggregate granular permission keys (`products.create`, `inventory.adjust`,
`reservations.cancel`, `refunds.create`, …). The `SessionAuthGuard` + `@RequirePermissions(...)`
decorator enforce them per endpoint; the admin UI hides navigation the user cannot use, but the
API is the actual boundary. Eight seeded roles: Super Admin, Catalog Manager, Inventory Manager,
Order Manager, Customer Support, Marketing Manager, Finance Manager, Read-only Analyst.

## Security

Argon2id password hashing · email verification and password reset via HMAC-hashed one-time tokens
· account lockout after 5 failed logins · session revocation (logout, password change/reset,
account disable) · HttpOnly/SameSite/Secure-configurable cookies · CORS restricted to
`TRUSTED_ORIGINS` · Zod validation on every input · upload allow-list (type + 5 MB cap) straight
to object storage — never the app filesystem · webhook signature verification · rate limiting with
stricter auth buckets · immutable audit log for admin/system actions · captcha provider interface
(disabled locally, Turnstile-ready).

## Documented assumptions

1. Prices are VAT-inclusive (EU model); the tax rate is a site setting used for display/reporting.
2. `recommended` sort = highest discount, then newest; `popularity` = lifetime units sold.
3. Coupon redemptions count on successful payment, not at checkout submission.
4. Coupon restrictions are stored as id arrays on the coupon row (MVP simplification).
5. A failed/cancelled payment returns holds to `ACTIVE` with their **original** deadline so the
   customer can retry inside the window.
6. Order cancellation of a paid-but-unshipped order restocks its units; refunds remain an explicit
   admin action.
7. Returned units re-enter available stock only when received as `RESELLABLE` with restock chosen.
8. Localization readiness = locale/currency stored per entity + `Intl` formatting everywhere;
   only `en`/EUR ship in the MVP.
9. Docker Compose runs apps in watch mode for the local-first MVP; production images/builds are
   validated in CI and documented in docs/deployment.md.
