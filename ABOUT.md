# About this project

An outlet marketplace — the model where surplus stock is released in short,
timed campaigns and sold until it runs out. Think Lounge by Zalando: limited
quantities, a countdown, and a price that returns to normal when the window
closes.

It is a portfolio and demonstration build, not a live shop. No real money moves
and no real stock exists. Everything else is real: the reservations hold, the
totals are computed from the database, and the administration panel changes
what customers see.

**Live demo:** https://ecommerce-135.pages.dev/

---

## What it demonstrates

**Stock that is actually held.** Adding an item to a bag takes an inventory
reservation for a fixed window, and the reservation expiring hands the units
back. Availability is `onHand − reserved`, claimed with a conditional `UPDATE`
so two shoppers racing for the last unit cannot both win. This is the part most
demo shops skip, and it is what makes "2 left" mean two.

**Prices the client cannot argue with.** A cart line stores the price the
server looked up, and every read re-derives the current one from the product,
its variant override and any running campaign. A campaign starting or ending
mid-session reprices the cart and says so, rather than failing at checkout.

**A back office that is the source of truth.** Products, categories, campaigns,
coupons, inventory, orders, returns, reviews and CMS pages are all editable, and
edits are visible on the storefront. Roles gate what each administrator can
reach, and every mutation is written to an audit log with a before/after
snapshot — as is storefront activity: sign-ins, refused sign-ins, orders placed,
returns requested.

**Three languages, one of them the default.** English, Georgian and Russian
across 769 interface strings, including the category tree. Georgian is the
shipped default rather than a translation bolted on, which means the static
export is pre-rendered in it.

**A catalogue with no dead ends.** 488 products across 122 subcategories and 10
brands, every subcategory stocked, with generated artwork so no product is a
grey box. 61 products are written by hand; the rest are derived from the
taxonomy, so adding a category stocks it too.

---

## How it is built

A pnpm monorepo with two complete backends behind one storefront.

|          | Cloudflare stack              | Local stack           |
| -------- | ----------------------------- | --------------------- |
| API      | `apps/edge` — Hono on Workers | `apps/api` — NestJS   |
| Database | D1 (SQLite)                   | PostgreSQL via Prisma |
| Media    | R2                            | MinIO                 |
| Jobs     | Cron triggers                 | `apps/worker` + Redis |

Both serve the same paths, so the storefront points at either with a base-URL
change. The Cloudflare stack is what the live demo runs on; the Docker stack is
what runs offline with no account anywhere.

- **`apps/storefront`** — Next.js 14, static export, no server at runtime
- **`apps/admin`** — the administration panel, same build strategy
- **`packages/*`** — 14 shared packages: the catalogue, domain rules, types,
  validation schemas, UI primitives, size guides

Shared packages are why the two backends agree: cart totals, delivery estimates
and free-shipping thresholds are computed by `@outlet/domain` in both, rather
than implemented twice and left to drift.

---

## Testing

174 cases across the edge suite, run against the real handlers, the real schema
and the real seed using Node's built-in SQLite as a D1 stand-in — no container,
no network, no Cloudflare account.

The suite's rule is worth stating, because it is what most of it exists for:
`apps/edge/test/admin-panel.test.ts` drives each screen with the exact path,
method and body the panel actually sends. A route can exist, pass its own unit
test, and still fail the panel because one side says `PUT` where the other
registered `PATCH` — a mismatch no test of either side alone can see. Several
tests feed the API its own output back to it, which is the only shape of
assertion that catches a read the corresponding write will reject.

---

## Honest limits

- **No real payments.** Checkout creates a genuine order and marks its own
  payment record paid. There is no provider and no card entry.
- **No email.** Registration is auto-verified and password reset is disabled
  rather than pretended; messages land in an in-app inbox instead.
- **Demo data.** Brands are invented. Product imagery is generated from
  silhouettes, not photographed.
- **One shopper.** The concurrency guarantees the reservation system is built
  around are real, but a single browser cannot demonstrate contention.

See [README.md](README.md) for running it, the demo accounts and the deployment
steps, [docs/architecture.md](docs/architecture.md) for how the pieces fit, and
[SECURITY.md](SECURITY.md) for the threat model.
