# Local setup

## 1. Prerequisites

- Docker Desktop (Compose v2) — the whole stack runs in containers
- Node.js ≥ 20 + pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`) —
  needed for host-side development, tests, and Playwright

## 2. Start everything

```bash
cp .env.example .env        # optional; compose ships safe defaults
docker compose up --build
```

What happens on `up`:

1. PostgreSQL, Redis, MinIO, Mailpit start with health checks; an init job creates the
   `outlet-local` / `outlet-test` buckets with public read.
2. The one-shot `migrate` service runs `prisma migrate deploy` and the idempotent seed
   (brands, categories, 22 products with variants and stock, 3 active + 2 upcoming campaigns,
   coupons, admin/customer accounts, example orders and a return).
3. API (4000), worker, storefront (3000), and admin (3001) start once their dependencies are
   healthy.

Re-running `docker compose up` re-runs the seed safely (everything is upserted by natural keys).
`pnpm local:reset` wipes volumes for a factory-fresh state.

## 3. Host-side development (optional, faster feedback)

```bash
docker compose up -d postgres redis minio minio-init mailpit
cp .env.local.example .env.local
pnpm install
pnpm db:generate && pnpm --filter "./packages/**" build
pnpm db:migrate && pnpm db:seed
pnpm dev:api          # terminal 1
pnpm dev:worker       # terminal 2
pnpm dev:storefront   # terminal 3
pnpm dev:admin        # terminal 4
```

Note: shared packages compile to `dist/`; rebuild a package (`pnpm --filter @outlet/domain build`)
after editing it, or run `tsc -w` in that package.

## 4. Acceptance walkthrough (mirrors the spec's checklist)

1. Open http://localhost:3000 and register a new customer.
2. Open http://localhost:8025 (Mailpit), click the verification link, sign in.
3. Browse campaigns and products; open **Aster Sambra Court Sneaker** — it has exactly one unit.
4. Add it to the cart: the 20-minute countdown appears; refresh — the timer does **not** reset.
5. In a private window, open the same product: size 42 is disabled for the second customer.
6. Checkout → mock payment page → **TEST-SUCCESS** → order confirmed; the confirmation email is
   in Mailpit. (Try TEST-FAIL / TEST-CANCEL / TEST-DELAYED too.)
7. Open http://localhost:3001, sign in as `admin@example.local` / `Admin123!`.
8. Create a product, add a variant with initial stock, upload an image (lands in MinIO —
   verify at http://localhost:9001).
9. Adjust inventory with a reason; see the movement and audit-log entries.
10. Create a campaign, assign the product with a campaign price; it appears on the storefront.
11. Orders: open the new order, move it PROCESSING → SHIPPED (tracking number) → DELIVERED.
12. As the customer, request a return; as admin approve → receive (restock resellable) →
    complete → issue a mock refund. Emails for every step appear in Mailpit.

## 5. Running tests

```bash
pnpm test                             # unit tests (pricing, coupons, state machines, expiry)
docker compose up -d postgres redis   # integration prerequisites
pnpm test:integration                 # reservations (incl. 100-way concurrency), payments,
                                      # duplicate webhooks, cart merge, inventory guards
docker compose up --build -d          # full stack for e2e
pnpm --filter @outlet/e2e install-browsers   # once
pnpm test:e2e
```

Integration tests use the separate `outlet_test` database (created automatically by the postgres
init script) and truncate it between tests. Some e2e flows consume seed data (the example return,
the final-unit product) — run `pnpm local:reset` for a clean slate before a full e2e pass.

## 6. Troubleshooting

| Symptom                                              | Fix                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ports 3000/3001/4000/5432/6379/8025/9000/9001 in use | Stop the conflicting service or change the published port in `docker-compose.yml` (documented ports only)    |
| `migrate` service fails                              | `docker compose logs migrate`; usually Postgres was still starting — `docker compose up -d migrate` to retry |
| Storefront shows "Could not load products"           | API not healthy yet — `docker compose logs api`                                                              |
| Emails missing                                       | All mail is captured by Mailpit (8025); check the worker logs — sending is queued                            |
| Reservation never expires                            | Check the worker container; the API also lazily expires on cart load, so a reload usually reconciles         |
| Windows line-ending warnings from git                | Cosmetic; `.gitattributes` normalizes to LF in the repository                                                |
