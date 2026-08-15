# Security

This repository is public on purpose: Cloudflare Pages builds from it. Every
file in it should be assumed readable by anyone, and the design below follows
from that single constraint.

This document describes the **demo/staging deployment** (Cloudflare Workers +
D1 + R2, `apps/edge`). The local Docker stack in `apps/api` is a development
environment that binds to localhost and is not covered by the same guarantees.

---

## Reporting a vulnerability

Open a GitHub issue describing what you found and how to reproduce it. This is
a demonstration deployment holding synthetic data, so there is no embargo
process and nothing confidential to protect — a public issue is fine.

Please do not run automated scanners against the deployed demo. It is on a
free Cloudflare plan and the traffic is more disruptive than the findings are
useful.

---

## How secrets are handled

Nothing secret is in this repository, and nothing secret ever should be.

| Kind of value          | Where it lives                                | Example                          |
| ---------------------- | --------------------------------------------- | -------------------------------- |
| Public configuration   | `apps/edge/wrangler.toml` `[vars]`, committed | `ALLOWED_ORIGINS`, `ENVIRONMENT` |
| Binding names          | `wrangler.toml`, committed                    | `DB`, `MEDIA`, `RATE_LIMIT`      |
| Worker secrets         | `wrangler secret put NAME`                    | `SESSION_SECRET`                 |
| Seed passwords         | Your shell, at seed time                      | `SEED_ADMIN_PASSWORD`            |
| Cloudflare credentials | Your shell or GitHub Secrets, never a file    | `CLOUDFLARE_API_TOKEN`           |
| Local development      | `.env`, gitignored                            | `DATABASE_URL`                   |

`.env.example` documents variable **names** and carries no values. `.gitignore`
excludes `.env` and `.env.*` while allowing the `*.example` files through.

A binding name is not a secret. `database_name = "outlet-demo"` tells an
attacker nothing they can use, because reaching that database requires
credentials that exist only in Cloudflare. `database_id` is likewise not a
credential, but it is left as a placeholder in the repository so that a fork
cannot accidentally write to someone else's database.

**`SESSION_SECRET` is required.** The Worker refuses to start without it in any
environment other than `development`, rather than falling back to a value
present in this file — a shared constant in a public repository is not a
secret, and treating it as one would be theatre.

### If a secret is ever committed

Rotate first, clean up second. Removing a value from the current tree does not
remove it from history, and a public repository is cloned continuously.

1. Rotate the credential at its source (Cloudflare dashboard, `wrangler secret
put`, re-seed).
2. Then decide whether to rewrite history. Rewriting is disruptive to anyone
   holding a clone and does not un-leak anything already fetched.

---

## Demo accounts

Passwords are **not** in this repository. They are supplied at seed time:

```bash
SEED_ADMIN_PASSWORD=… SEED_CUSTOMER_PASSWORD=… pnpm db:seed:demo
```

Leave the variables unset and the seed generates strong passwords and prints
them once. They are never written to disk, never committed, and never appear
in a client bundle.

Every seeded account is synthetic. The addresses are on `demo.local`, a
reserved TLD that cannot receive mail, and no row describes a real person. The
accounts have access to nothing but this demo's own D1 database.

The local Docker stack (`packages/database/src/seed`) is a separate case: it
uses `*.example.local` accounts with passwords in source, documented in the
README. Those are throwaway credentials for a database that listens on
localhost, and they reach no deployed system. A real administrator credential
for that stack comes from `SEED_SUPERADMIN_*` in a gitignored `.env`.

---

## What the demo deliberately does not have

Absence is a security property here, not an omission:

- **No payment provider.** There is no processor, no API key, and no card
  field. `POST /checkout/submit` writes a `payments` row with
  `provider = 'demo'` and marks it paid itself. There is no code path that
  could move money even if a credential were supplied.
- **No email provider.** There is no SMTP client, no provider SDK and no
  credential for one. Messages the platform would have sent are written to the
  `simulated_emails` table and read back by the customer who owns them at
  `/account/inbox`; nothing is transmitted to any address. `POST
/auth/forgot-password` and `POST /auth/reset-password` therefore issue no
  token — returning one would hand anybody who knows an address the ability to
  take over that account — and both say what they actually did instead.
- **No third-party analytics, tag managers or advertising scripts.** The
  Content-Security-Policy on the API is `default-src 'none'`.

`DEMO_MODE` controls exactly these things. It does **not** bypass
authentication, relax authorisation, or widen CORS, and no code branches on it
to skip a security check.

---

## Application security

### Authentication

- Passwords are hashed with PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte
  random salt — OWASP's guidance for this KDF. argon2 and bcrypt are native
  modules and cannot run on Workers; PBKDF2 via Web Crypto is the platform's
  standard answer. The stored form is self-describing, and a correct password
  verified against weaker parameters is re-hashed in place, so the cost can be
  raised later without stranding accounts.
- A session is an opaque 256-bit token in an `HttpOnly` cookie. Only an HMAC of
  it is stored, so a database dump yields no usable session.
- Sign-in always creates a new session row and never reuses an incoming
  cookie — session fixation is not expressible.
- Sign-out **revokes the row**. Clearing the cookie alone would leave a
  captured token working.
- Changing a password revokes every other session.
- A failed sign-in returns the same message and takes the same time whether the
  account is unknown, the password is wrong, or the account is locked: an
  unknown address is still verified against a dummy hash, so response time is
  not an oracle either.
- Per-account lockout after 8 failed attempts, plus per-IP and per-address rate
  limiting.

### Session cookies

`HttpOnly; Secure; SameSite=None; Path=/` in the deployed demo.

`SameSite=None` is not a relaxation chosen for convenience. The frontend is on
`*.pages.dev` and the API on `*.workers.dev`; both are public suffixes, so
every request is cross-site by construction and `Lax` would drop the cookie
entirely. Development uses `SameSite=Lax` without `Secure`, because localhost
ports are same-site and plain HTTP.

### CSRF

Because `SameSite` cannot do the work here, every state-changing request
(`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` — or failing that a
`Referer` — that is on the configured allow-list, and is rejected **before the
handler runs** if it does not. A cross-site form post from an attacker's page
carries that page's origin and fails.

This is a check on the request, not a response header the attacker's browser is
free to ignore, so it does not rely on CORS to protect anything. Requests with
neither an origin nor a cookie (curl, tests, server-to-server) are allowed
through as unauthenticated callers.

### Authorization

Every admin route begins with `requirePermission(session, …)`, checked against
roles loaded from the database. The admin panel hides controls a user cannot
operate, but that is presentation — removing the button and calling the
endpoint directly still fails.

Object-level authorization is enforced in the loader rather than by each
caller: `loadOrder` takes a viewer and refuses to return an order that viewer
is not entitled to, and cart mutations resolve the line through a query that
includes the cart id. A customer requesting someone else's order gets **404,
not 403** — a 403 would confirm the id names a real order.

### D1 / SQL

Every value is a bound parameter. No helper accepts a caller-supplied SQL
fragment. Identifiers that vary by request — sort columns, filter columns —
resolve through an allow-list _before_ reaching a query string; an unrecognised
`?sort=` falls back to the default rather than being passed through.

### Price and total integrity

The client cannot influence what anything costs:

- Cart lines store the price the server looked up, and every read re-derives
  the current one from the product, its variant override and any running
  campaign.
- `POST /checkout/submit` accepts an address, an email and a shipping method.
  Request schemas are `.strict()`, so a body carrying `unitPriceMinor` or
  `totalMinor` is rejected outright rather than ignored.
- `expectedTotalMinor` is the one client figure that is read, and it can only
  cause a _refusal_: if the total moved while the checkout page was open the
  order stops and shows the new one.

### Inventory integrity

Reserving stock is a conditional `UPDATE` whose predicate and write are one
statement, so two shoppers racing for the last unit cannot both win. Order
placement commits the reservation inside the same D1 batch as the order rows.
Database `CHECK` constraints (`onHandQuantity >= 0`,
`reservedQuantity <= onHandQuantity`) are the backstop underneath, and would
abort the transaction if the application logic were ever wrong.

### Uploads and R2

- Admin-only, behind `products.update`.
- Type is decided from the file's **magic bytes**, not its `Content-Type` or
  filename, and the declared type must agree. SVG is refused because it can
  carry script.
- 5 MB limit, checked before the body is read into memory.
- The object key is generated server-side. The client's filename is stored for
  reference and never used to build a path, so there is no traversal to defend
  against.
- Reads are restricted to known public prefixes, with keys validated against an
  allow-list of characters and empty/dot segments rejected. Deletion resolves
  the key from the database row, never from the request.

### Input validation

Every body is parsed through a zod schema, `.strict()` where safe, with lengths
bounded. Path identifiers are validated against a character allow-list and a
length cap. Query parameters are coerced and clamped — page size is capped at
96 so one request cannot ask for the whole catalogue.

### Errors and logging

Clients receive a stable code, a sentence written for a shopper, and a request
id. They never receive SQL, a stack trace, a file path, or a schema detail — a
D1 error message routinely contains the failing statement, which is exactly why
none of them reaches a response body. The detail is logged server-side against
the same request id.

Logs carry no passwords, tokens, cookies or authorization headers.

### Security headers

Set on every response including errors: `Content-Security-Policy: default-src
'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`,
and `Strict-Transport-Security` outside development.

### CORS

`Access-Control-Allow-Origin` is only ever an exact origin from the allow-list.
`*` is never sent — it cannot be combined with credentials and would be wrong
here even if it could.

### Rate limiting

Cloudflare KV counters on sign-in, registration, password reset, checkout,
coupon validation, review creation, search and upload. KV is eventually
consistent, so a determined distributed attacker can exceed a limit briefly;
the purpose is to make trivial brute-forcing useless, and for that it is
adequate. The limiter fails open if the KV binding is absent, so a fork without
it still runs — no other security decision depends on it.

---

## Supported environments

| Environment        | Purpose                   | Guarantees                                                                      |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------- |
| `development`      | `wrangler dev`, localhost | Session secret may fall back to a development default; cookies are not `Secure` |
| `preview`          | Pages preview builds      | As demo                                                                         |
| `demo` / `staging` | The deployed demo         | Everything in this document                                                     |

There is no production environment. `db:reset-demo` refuses to touch a remote
database unless `ENVIRONMENT` identifies itself as one of the above _and_
`--yes-really` is passed.

---

## Demo environment limitations

Known and accepted, listed so nobody mistakes them for oversights:

- **No password reset.** No email provider, and issuing a token without one
  would be an account-takeover primitive.
- **No email verification.** New accounts are created verified; requiring
  verification with no way to send it would lock every new account out.
- **Demo credentials are shared.** Anyone with the demo URL and the documented
  passwords can sign in as an administrator of _this demo_. That is the point
  of a demo, and the blast radius is one D1 database of synthetic data.
- **Rate limiting is eventually consistent.** See above.
- **No CAPTCHA.** Turnstile is free and supported by the code, but it is not
  enabled here; registration is protected by rate limiting alone.
- **The audit log is append-only by convention, not by constraint.** An
  administrator with database access could alter it.

---

## Checklist

- [x] No secrets in the repository
- [x] No secrets in git history (scanned; none found)
- [x] `.env` and variants gitignored; `*.example` allowed through
- [x] `.env.example` contains names only
- [x] Cloudflare secrets configured externally, never in a file
- [x] No secret reaches a client bundle
- [x] Admin RBAC enforced server-side on every admin route
- [x] IDOR protection in the loader, 404 rather than 403
- [x] Parameterized D1 queries; sort/filter identifiers allow-listed
- [x] Input validation on every body, path and query parameter
- [x] XSS: the API emits JSON only, under `default-src 'none'`
- [x] CSRF: origin validated on every state-changing request
- [x] CORS restricted to exact origins; never `*`
- [x] Security headers on every response, errors included
- [x] Rate limiting on authentication and other sensitive endpoints
- [x] Secure sessions: HttpOnly, Secure, revoked server-side, expiring
- [x] R2 upload validation by magic bytes; server-generated keys
- [x] R2 authorization: admin-only upload and delete
- [x] No debug, test-auth or bypass endpoints
- [x] Demo payment isolated: no provider, no credential, no code path to money
- [x] Server-side price and total calculation
- [x] Inventory protected against race conditions by conditional update + CHECK
- [x] GitHub Actions use least-privilege permissions
- [x] Dependencies audited
- [x] Production build tested
