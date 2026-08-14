You are working on the existing e-commerce repository:

https://github.com/hoffman1938/ecommerce

Your task is to transform the current project into a fully functional, production-quality DEMO/STAGING e-commerce website that is ready to be presented to reviewers and potential stakeholders.

IMPORTANT:

At this stage the project MUST remain completely free to operate.

DO NOT integrate or require:

- Real payment providers
- Real payment processing
- Real email providers
- SMS providers
- Paid APIs
- Paid SaaS services
- Paid analytics
- Real shipping provider APIs
- Real refund/payment processing

The goal is NOT to launch a real commercial store yet.

The goal is to create a highly polished, realistic, fully functional production DEMO that behaves like a real e-commerce platform and can be presented for approval.

==================================================

1. MAIN OBJECTIVE
   \==================================================

The final website must feel like a real production e-commerce platform.

A reviewer should be able to:

1. Open the website.
2. Browse categories.
3. Search products.
4. Filter and sort products.
5. Open product pages.
6. Select variants.
7. Select sizes.
8. Add products to cart.
9. Change quantities.
10. Save items for later.
11. Add products to wishlist.
12. Apply demo coupons.
13. Proceed through checkout.
14. Complete a DEMO order without real payment.
15. View the created order.
16. Open the admin panel.
17. Manage products.
18. Manage categories.
19. Manage brands.
20. Manage inventory.
21. Manage orders.
22. Manage reviews.
23. Manage campaigns.
24. Manage coupons.
25. Manage users.
26. View audit logs.
27. Manage CMS content.

Everything should work with real database data.

DO NOT build fake frontend-only interactions.

================================================== 2. DATABASE
===

Use the existing repository database structure as the source of truth.

The current project contains approximately 43 tables covering:

- users
- user\_sessions
- addresses
- roles
- permissions
- role\_permissions
- user\_roles
- customer\_support\_notes
- brands
- categories
- products
- product\_variants
- product\_images
- product\_attributes
- product\_attribute\_values
- campaigns
- campaign\_products
- inventory\_balances
- inventory\_movements
- inventory\_reservations
- carts
- cart\_items
- wishlists
- wishlist\_items
- coupons
- promotions
- orders
- order\_items
- order\_status\_history
- payments
- payment\_events
- shipments
- shipment\_events
- return\_requests
- return\_items
- refunds
- notifications
- newsletter\_subscriptions
- audit\_logs
- site\_settings
- content\_pages
- uploaded\_files
- background\_job\_records
- product\_reviews

Preserve the business model.

Do not remove functionality simply because this is a demo.

================================================== 3. CLOUDFLARE ARCHITECTURE
===

The target architecture is:

Cloudflare Pages
↓
Frontend

Cloudflare Workers
↓
API/backend

Cloudflare D1
↓
Primary database

Cloudflare R2
↓
Images and uploaded files

Cloudflare Queues
↓
Only if genuinely necessary

Everything must be compatible with Cloudflare's free/available development setup.

Do not introduce unnecessary paid infrastructure.

================================================== 4. DATABASE MIGRATION TO D1
===

The existing project is PostgreSQL-oriented.

Adapt the database layer for Cloudflare D1/SQLite.

Do NOT blindly execute PostgreSQL migrations against D1.

Create a clean D1-compatible schema and migration system.

Convert PostgreSQL-specific features appropriately:

ENUM
→ TEXT with application-level validation

JSONB
→ TEXT containing JSON

TEXT\[]
→ TEXT containing JSON OR proper relational tables where appropriate

TIMESTAMP(3)
→ SQLite-compatible timestamp representation

Do not use floating point values for money.

Continue using integer minor units:

4999 = €49.99

Preserve:

- primary keys
- foreign keys
- indexes
- unique constraints
- CHECK constraints
- cascading behavior where appropriate
- transactional behavior

Create proper D1 migrations.

Make the database reproducible from an empty D1 database.

================================================== 5. SEED A REALISTIC DEMO DATABASE
===

THIS IS CRITICAL.

The website must NOT appear empty after deployment.

Create a comprehensive production-demo seed system.

The seed must populate the REAL D1 database.

Do NOT hardcode fake products only in frontend code.

The seed must create actual database records.

Create realistic data for:

USERS
BRANDS
CATEGORIES
SUBCATEGORIES
PRODUCTS
PRODUCT VARIANTS
SIZES
COLORS
PRODUCT IMAGES
INVENTORY
CAMPAIGNS
COUPONS
PROMOTIONS
CARTS
WISHLISTS
ORDERS
ORDER ITEMS
REVIEWS
NOTIFICATIONS
CMS CONTENT
SITE SETTINGS
AUDIT LOGS

================================================== 6. DEMO PRODUCT CATALOG
===

Create a realistic fashion catalog.

Use well-known fashion categories and realistic product naming, but DO NOT falsely claim affiliation with real brands if the website is only a demo.

Prefer realistic demo brands such as:

Aster
Northline
Velora
Maison Rue
Urban Theory
Lunaro
Everline
Monarch
Atelier Nine
Forma

Create at least:

10+ brands

40+ products

100+ product variants

Multiple colors per product

Multiple sizes per product

Different prices

Different discount prices

Different stock quantities

Different product categories

Create products for:

MEN
WOMEN
KIDS
UNISEX

Categories should include examples such as:

Men
Clothing
T-Shirts
Shirts
Jeans
Trousers
Jackets
Hoodies
Shoes
Accessories

Women
Clothing
Dresses
Tops
Shirts
Jeans
Trousers
Jackets
Knitwear
Shoes
Accessories

Kids
Boys
Girls
Clothing
Shoes
Accessories

Unisex
Hoodies
Sneakers
Accessories
Bags

Use realistic descriptions, materials, care instructions, country of origin, SEO metadata, etc.

================================================== 7. PRODUCT VARIANTS
===

Every relevant product should have realistic variants.

Examples:

Black / XS
Black / S
Black / M
Black / L
Black / XL

White / S
White / M
White / L

Blue / 30
Blue / 32
Blue / 34
Blue / 36

Shoes:

EU 36
EU 37
EU 38
EU 39
EU 40
EU 41
EU 42
EU 43
EU 44
EU 45

Inventory must exist for each variant.

Some variants should intentionally have:

- high stock
- low stock
- zero stock

This is necessary to demonstrate real inventory behavior.

================================================== 8. PRODUCT IMAGES
===

Use Cloudflare R2 for product images.

The UI must never show broken image placeholders.

If external images cannot legally or reliably be used, create/use appropriate demo product imagery or generated assets.

Each important product should have:

- primary image
- secondary image
- optional detail image
- correct alt text

Create realistic image object keys.

Example:

/products/{productId}/main.webp
/products/{productId}/front.webp
/products/{productId}/detail.webp

Store metadata in D1.

================================================== 9. HOMEPAGE
===

The homepage must look populated and professional.

Include:

- Hero section
- Featured products
- New arrivals
- Best sellers
- Sale section
- Categories
- Featured brands
- Campaign banner
- Newsletter section
- Footer

All important content must come from the database.

Do not hardcode the entire homepage.

Admin should be able to change important content.

================================================== 10. PRODUCT PAGE
===

Product pages must support:

- image gallery
- product title
- brand
- price
- original price
- discount
- description
- materials
- care instructions
- country of origin
- colors
- sizes
- stock status
- quantity selector
- add to cart
- wishlist
- reviews
- rating
- related products
- campaign information

Variant selection must affect:

- selected SKU
- stock
- price
- availability

Do not allow users to purchase unavailable variants.

================================================== 11. SEARCH / FILTERS / SORTING
===

Implement functional:

Search

Filter by:

- category
- subcategory
- brand
- gender
- size
- color
- price
- availability
- sale

Sort by:

- newest
- price low to high
- price high to low
- popularity
- rating

Do not implement these only visually.

They must query the real database.

================================================== 12. CART
===

Cart must be fully functional.

Support:

- add product
- remove product
- change quantity
- save for later
- restore saved item
- clear cart
- coupon
- subtotal
- discount
- total
- stock validation

The cart must survive page refresh.

Anonymous users should have a working cart.

Authenticated users should have a persistent cart.

================================================== 13. DEMO CHECKOUT
===

Because this is a free presentation/demo environment:

DO NOT integrate real payments.

Create a clearly controlled:

"Demo Checkout"

flow.

The user can enter:

Name
Email
Phone
Address
City
Postal code
Country
Shipping method

Then show:

Order summary
Subtotal
Discount
Shipping
Total

Instead of real payment, display:

"Demo Payment"

with a button:

"Place Demo Order"

When clicked:

1. Validate stock.
2. Reserve/deduct inventory correctly.
3. Create order.
4. Create order items.
5. Create order status history.
6. Create demo payment record.
7. Mark demo payment as successful.
8. Update inventory.
9. Clear cart.
10. Create notification.
11. Redirect to order confirmation.

The order must be a REAL D1 record.

Make it obvious that this is a demonstration payment and no real money is charged.

================================================== 14. INVENTORY
===

Implement proper inventory behavior.

When an order is created:

available stock must decrease.

Do not allow:

stock < 0

Handle concurrent purchases safely using transactions/atomic updates where possible.

Admin must see:

On hand
Reserved
Sold
Returned
Damaged

Also maintain inventory movement history.

================================================== 15. ORDERS
===

Create realistic order management.

Customer can view:

- order number
- date
- status
- items
- quantities
- prices
- total
- shipping address
- shipping method

Admin can:

- view orders
- filter orders
- search orders
- change order status
- add internal notes
- view customer
- view payment
- view inventory effects

Use realistic demo order statuses.

================================================== 16. ADMIN PANEL
===

The admin panel must be presentation-ready.

Create a professional dashboard showing:

- total products
- active products
- inventory
- orders
- demo revenue
- customers
- reviews
- low stock products
- recent orders
- recent activity

Admin navigation should include:

Dashboard
Products
Categories
Brands
Inventory
Orders
Customers
Reviews
Coupons
Promotions
Campaigns
Returns
Shipments
CMS
Media
Users
Roles \& Permissions
Audit Logs
Settings

Do not create empty admin pages.

Every important section should contain realistic seeded data.

================================================== 17. ADMIN PRODUCT MANAGEMENT
===

Admin must be able to:

Create
Read
Update
Archive

products.

Support:

- name
- description
- brand
- category
- subcategory
- gender
- prices
- discount
- SKU
- barcode
- variants
- sizes
- colors
- inventory
- images
- SEO
- status

Image upload should use R2.

================================================== 18. REVIEWS
===

Seed realistic reviews.

Use different ratings:

5
4
3
2

Include:

- reviewer name
- title
- body
- rating
- verified purchase
- date
- status

Admin must be able to:

- publish
- reject
- delete/moderate

Product ratings must be calculated/displayed correctly.

================================================== 19. COUPONS
===

Create working demo coupons.

Examples:

WELCOME10
SALE15
FREESHIP
DEMO20

They must actually affect checkout calculations.

Support:

- percentage discount
- fixed discount
- minimum order
- expiration
- active/inactive
- usage limits

Do not allow invalid or expired coupons.

================================================== 20. WISHLIST
===

Implement:

- add
- remove
- view
- move to cart

for authenticated users.

================================================== 21. AUTHENTICATION
===

Implement production-quality demo authentication.

Support:

- registration
- login
- logout
- password hashing
- sessions
- protected routes
- admin authentication
- role-based access

Because email is not being used yet:

DO NOT require real email verification.

Instead, seed demo accounts.

For example:

Admin:
admin@demo.local

Customer:
customer@demo.local

Use clearly documented demo credentials.

Never expose passwords in production code or frontend source.

Use environment variables or a secure seed mechanism for demo credentials.

================================================== 22. DEMO DATA
===

Create at least:

1 admin user

3-5 staff/admin users with different roles

10+ customer users

10+ brands

20+ categories/subcategories

40+ products

100+ variants

100+ inventory records

30+ reviews

20+ historical orders

10+ demo notifications

5+ coupons

5+ campaigns/promotions

5+ CMS pages

multiple audit log records

The website must look populated immediately after deployment.

================================================== 23. CMS
===

Seed realistic content pages:

About Us
Shipping
Returns
Size Guide
Privacy
Terms
Contact

The content must be editable through admin.

================================================== 24. SIZE GUIDE
===

Implement realistic size guides.

Support:

Men
Women
Kids
Unisex

And product categories such as:

T-shirts
Shirts
Jeans
Trousers
Dresses
Jackets
Shoes

Support regional sizing:

EU
US
UK
IT
FR
JP

Do not incorrectly use one universal size chart.

Size guide must be connected to relevant product/category types.

================================================== 25. UI/UX
===

The website must look like a real premium fashion e-commerce platform.

Prioritize:

- clean layout
- strong typography
- excellent spacing
- high-quality product imagery
- responsive design
- mobile usability
- desktop usability
- accessible controls
- loading states
- empty states
- error states
- skeleton states
- success states
- proper form validation

Dark mode must also look intentionally designed, not simply inverted colors.

Do not use excessive gradients, excessive rounded cards, or generic AI-generated dashboard styling.

================================================== 26. RESPONSIVENESS
===

Test:

Mobile
Tablet
Desktop
Large desktop

Important flows must work without horizontal scrolling.

================================================== 27. SECURITY
===

Even though this is a demo, follow production security practices.

Implement:

- input validation
- authorization checks
- RBAC
- secure sessions
- password hashing
- rate limiting where practical
- secure cookies
- CSRF protection where applicable
- XSS prevention
- SQL injection protection
- upload validation
- request size limits
- audit logging

Never trust frontend permissions.

Every admin operation must be authorized on the backend.

================================================== 28. DEMO ENVIRONMENT
===

Clearly define this environment as:

DEMO / STAGING

There must be no possibility of accidentally charging real money.

Do not connect real payment providers.

Do not send real transactional emails.

Do not create real financial transactions.

================================================== 29. PERFORMANCE
===

Optimize for Cloudflare.

Avoid:

- unnecessary database queries
- N+1 queries
- huge API responses
- loading every product at once
- unnecessary client-side rendering
- oversized images

Implement:

- pagination
- database indexes
- image optimization
- caching where appropriate
- lazy loading
- efficient queries

================================================== 30. ERROR HANDLING
===

Every major operation needs proper error handling.

Examples:

Out of stock
Invalid coupon
Invalid variant
Unauthorized request
Expired session
Missing product
Database failure
R2 failure
Invalid form
Invalid order

Never show raw database errors to users.

================================================== 31. OBSERVABILITY
===

Create:

/api/health

It should verify the application environment.

Add structured logging for important operations:

- authentication
- orders
- inventory
- admin changes
- errors

Use Cloudflare-compatible logging.

Do not require paid monitoring services.

================================================== 32. ENVIRONMENT VARIABLES
===

Create a clean environment configuration.

Document:

Development
Preview
Production/Demo

Do not commit secrets.

Create/update:

.env.example

Document all required variables.

================================================== 33. CLOUDFLARE CONFIGURATION
===

Create/update the Cloudflare configuration so that the project can be deployed cleanly.

Configure:

D1
R2
Workers
Pages

Use appropriate bindings.

Do not hardcode Cloudflare account IDs or secrets.

================================================== 34. DATABASE SEED COMMAND
===

Create an easy command such as:

npm run db:seed

or an equivalent project-appropriate command.

It must:

1. Create demo users.
2. Create catalog.
3. Create variants.
4. Create inventory.
5. Create reviews.
6. Create campaigns.
7. Create coupons.
8. Create demo orders.
9. Create CMS content.
10. Create settings.

It must be safe to run repeatedly.

Avoid duplicate seed data.

================================================== 35. DEMO RESET
===

Create a safe development/demo reset mechanism.

Example:

npm run db:reset-demo

This should reset ONLY the demo environment.

Never create a command that can accidentally wipe production data without an explicit environment check.

================================================== 36. TESTING
===

Before declaring the project complete, test:

Authentication
Product browsing
Search
Filtering
Sorting
Product variants
Size selection
Cart
Wishlist
Coupon
Demo checkout
Order creation
Inventory
Reviews
Admin
RBAC
R2 uploads
CMS
Audit logs

Also test edge cases:

- out-of-stock variant
- invalid coupon
- expired coupon
- quantity greater than stock
- duplicate checkout click
- unauthorized admin request
- missing product
- invalid variant
- session expiration

================================================== 37. DO NOT BREAK EXISTING FUNCTIONALITY
===

Before modifying existing code:

Understand how it works.

Do not rewrite the entire application unnecessarily.

Prefer targeted refactoring.

Preserve existing UI/UX where it is already good.

Improve it where necessary.

================================================== 38. NO PLACEHOLDERS
===

Do NOT leave:

TODO
Coming soon
Lorem ipsum
Empty dashboards
Fake buttons
Non-functional forms
Dead links
Broken images
Mock arrays replacing database calls

Every visible important feature must either:

A. work fully

or

B. be intentionally hidden from the demo.

Do not show broken functionality.

================================================== 39. FINAL QUALITY CHECK
===

Before finishing:

Run:

- type checking
- linting
- build
- database migrations
- seed
- tests

Fix all errors.

Then perform a complete user journey:

Homepage
→ category
→ product
→ select variant
→ add to cart
→ cart
→ coupon
→ checkout
→ demo payment
→ order confirmation
→ order history

Then perform admin journey:

Admin login
→ dashboard
→ products
→ edit product
→ inventory
→ orders
→ reviews
→ campaigns
→ coupons
→ users
→ audit logs
→ CMS

Everything must work using real D1 data.

================================================== 40. FINAL DELIVERABLE
===

When finished, provide:

1. Summary of architecture.
2. Database migration summary.
3. List of D1 tables.
4. R2 structure.
5. Demo accounts.
6. Demo coupon codes.
7. Seed command.
8. Reset command.
9. Cloudflare deployment commands.
10. Environment variables required.
11. Any limitations intentionally left for the future.
12. List of tests performed.

Most importantly:

DO NOT tell me that something is "implemented" unless you actually implemented and tested it.

The final result should be a polished, realistic, fully functional FREE DEMO/STAGING e-commerce platform suitable for presentation and approval.

SECURITY AUDIT \& HARDENING PROMPT

=================================

You are working on the public GitHub repository:

https://github.com/hoffman1938/ecommerce

The repository is intentionally PUBLIC because Cloudflare Pages needs access to the repository for deployment.

IMPORTANT:

DO NOT make the repository private.

The goal is to make the application secure while keeping the repository public.

This is a defensive security audit and hardening task.

Do NOT remove Cloudflare Pages/GitHub integration.

==================================================

1\. SECURITY OBJECTIVE

==================================================

Perform a complete security audit of the entire repository and then implement all necessary fixes.

The application is a Cloudflare-based e-commerce DEMO/STAGING platform.

Target architecture:

GitHub PUBLIC repository

&#x20; ↓

Cloudflare Pages

&#x20; ↓

Cloudflare Workers

&#x20; ↓

Cloudflare D1

&#x20; ↓

Cloudflare R2

The application must remain deployable from the PUBLIC GitHub repository.

NO secrets, credentials, tokens, private keys, passwords, API keys, database credentials, Cloudflare credentials, or other sensitive values may exist in the repository.

==================================================

2\. FIRST: FULL REPOSITORY SECURITY AUDIT

==================================================

Before changing code, inspect the entire repository.

Search for:

\- API keys

\- access tokens

\- JWT secrets

\- session secrets

\- passwords

\- database URLs

\- Cloudflare API tokens

\- Cloudflare Account IDs where inappropriate

\- R2 credentials

\- private keys

\- SSH keys

\- webhook secrets

\- payment credentials

\- email credentials

\- OAuth client secrets

\- service account credentials

\- hardcoded admin passwords

\- hardcoded customer passwords

\- .env files

\- environment-specific secrets

\- credentials inside JSON

\- credentials inside YAML

\- credentials inside configuration files

\- secrets inside frontend source

\- secrets inside tests

\- secrets inside seed files

\- secrets inside documentation

\- secrets inside GitHub Actions

Search the entire repository, not just the current working tree.

==================================================

3\. GIT HISTORY SECURITY

==================================================

Because the repository is PUBLIC, inspect Git history for accidentally committed secrets.

Search:

\- current files

\- deleted files

\- previous commits

\- previous .env files

\- previous configuration files

\- old API keys

\- old credentials

\- old tokens

\- old database connection strings

IMPORTANT:

Deleting a secret from the current file is NOT enough if it exists in Git history.

If real credentials are found in Git history:

1\. Identify them.

2\. Treat them as compromised.

3\. DO NOT print the actual secret in the final report.

4\. Recommend immediate rotation/revocation.

5\. If safe and appropriate, remove the secret from repository history using a proper history-rewrite procedure.

6\. Do not rewrite Git history automatically if it could disrupt collaboration without clearly documenting the consequences.

Never expose discovered secrets in logs or output.

==================================================

4\. PUBLIC REPOSITORY RULE

==================================================

Assume that every file in the repository can be read by an attacker.

Therefore:

SAFE TO COMMIT:

\- source code

\- database schema

\- migrations

\- public configuration

\- Cloudflare binding names

\- environment variable names

\- public URLs

\- demo data that contains no sensitive information

\- documentation

NEVER COMMIT:

\- secret values

\- passwords

\- tokens

\- private keys

\- API credentials

\- database credentials

\- Cloudflare API tokens

\- R2 credentials

\- JWT secrets

\- session secrets

==================================================

5\. ENVIRONMENT VARIABLES

==================================================

Create/update:

.env.example

It must contain variable NAMES only.

Example:

DATABASE\_ID=

R2\_BUCKET\_NAME=

SESSION\_SECRET=

JWT\_SECRET=

Do NOT put real values inside it.

Use:

Local development:

.env

Cloudflare:

wrangler secrets / Cloudflare environment secrets

Production/Demo:

Cloudflare environment variables/secrets

Make sure .env and all secret variants are properly ignored by Git.

Check:

.env

.env.\*

!.env.example

Do not accidentally ignore necessary public configuration.

==================================================

6\. CLOUDFLARE SECURITY

==================================================

Audit Cloudflare configuration.

Review:

wrangler configuration

Pages configuration

Workers configuration

D1 bindings

R2 bindings

environment variables

secrets

deployment configuration

Never place:

CLOUDFLARE\_API\_TOKEN

or other privileged Cloudflare credentials inside the repository.

Cloudflare bindings such as:

D1 database binding

R2 bucket binding

may be referenced by binding NAME.

The actual credentials and infrastructure access must remain outside the repository.

==================================================

7\. FRONTEND SECRET LEAK CHECK

==================================================

This is extremely important.

Anything bundled into frontend JavaScript can be discovered by users.

Therefore:

NEVER expose secrets through:

NEXT\_PUBLIC\_\*

VITE\_\*

PUBLIC\_\*

client-side environment variables

window.\_\_CONFIG\_\_

HTML

JavaScript bundles

Audit all environment variable usage.

Classify every variable as:

PUBLIC

or

SERVER-ONLY

Only genuinely public configuration may reach the browser.

Examples of public information:

PUBLIC\_SITE\_URL

PUBLIC\_BRAND\_NAME

Examples that MUST remain server-only:

SESSION\_SECRET

JWT\_SECRET

ADMIN\_SECRET

DATABASE credentials

R2 credentials

API tokens

==================================================

8\. AUTHENTICATION SECURITY

==================================================

Audit the complete authentication system.

Implement secure:

\- password hashing

\- session creation

\- session expiration

\- session revocation

\- logout

\- login failure handling

\- account lockout/rate limiting where appropriate

\- password reset architecture

\- protected routes

Never store plaintext passwords.

Never compare plaintext passwords against database values.

Use a strong password hashing algorithm supported by the deployment environment.

Never store passwords in:

\- frontend

\- localStorage

\- cookies

\- URLs

\- logs

==================================================

9\. SESSION SECURITY

==================================================

Sessions must use secure cookies.

Use appropriate cookie flags:

HttpOnly

Secure

SameSite

Do not store authentication tokens in localStorage unless there is a strong architectural reason.

Prevent:

\- session fixation

\- session reuse after logout

\- unauthorized session access

Sessions must expire.

Admin sessions should have appropriate security controls.

==================================================

10\. ADMIN SECURITY

==================================================

This is CRITICAL.

Never trust the frontend to determine whether someone is an admin.

Every admin API endpoint must verify authorization server-side.

For every admin operation:

1\. Authenticate user.

2\. Verify session.

3\. Load user role/permissions.

4\. Check required permission.

5\. Only then execute the operation.

Example:

Frontend:

/admin/products/delete

must NOT be protected only by hiding the button.

Backend must enforce:

products.delete

==================================================

11\. RBAC AUDIT

==================================================

Audit:

roles

permissions

user\_roles

role\_permissions

Make sure permissions are actually enforced.

Test:

Customer cannot:

\- create product

\- edit product

\- delete product

\- modify inventory

\- modify users

\- access audit logs

\- change orders

\- manage coupons

\- access admin APIs

Staff with limited permissions must only access allowed operations.

Admin can access all intended admin functionality.

==================================================

12\. IDOR / OBJECT AUTHORIZATION

==================================================

Perform a complete IDOR/BOLA audit.

Test endpoints such as:

/api/orders/:id

/api/users/:id

/api/products/:id

/api/carts/:id

/api/reviews/:id

/api/inventory/:id

/api/returns/:id

A user must never be able to access another user's data simply by changing an ID.

For example:

User A:

GET /api/orders/order\_A

must work.

User A:

GET /api/orders/order\_B

must return:

403 or 404

if order\_B belongs to User B.

Do the same for:

\- addresses

\- carts

\- wishlists

\- reviews where applicable

\- notifications

\- returns

\- customer information

==================================================

13\. INPUT VALIDATION

==================================================

Validate ALL external input.

This includes:

\- JSON body

\- query parameters

\- URL parameters

\- form data

\- headers where applicable

\- uploaded files

\- cookies

Do not trust frontend validation.

Backend validation is mandatory.

Validate:

\- strings

\- numbers

\- enums

\- UUIDs/IDs

\- email format

\- quantities

\- prices

\- pagination

\- sorting

\- filters

Reject unexpected fields where appropriate.

==================================================

14\. SQL / D1 SECURITY

==================================================

Audit all D1 queries.

Never construct SQL using unsafe string concatenation.

Do NOT do:

"SELECT \* FROM products WHERE id = '" + id + "'"

Use parameterized queries/prepared statements.

Audit:

\- SELECT

\- INSERT

\- UPDATE

\- DELETE

\- search

\- filters

\- sorting

\- pagination

Also verify that user-controlled sorting fields cannot become arbitrary SQL.

==================================================

15\. XSS SECURITY

==================================================

Audit all user-controlled content:

\- reviews

\- product descriptions

\- product names

\- CMS content

\- admin notes

\- customer names

\- search queries

\- coupon codes

Do not dangerously inject arbitrary HTML.

If rich text is required:

1\. Sanitize HTML.

2\. Allow only a strict safe subset.

3\. Strip scripts/event handlers/javascript URLs.

Pay particular attention to:

innerHTML

dangerouslySetInnerHTML

HTML rendering

markdown rendering

==================================================

16\. CSRF

==================================================

Review all state-changing requests.

For cookie-authenticated APIs, implement appropriate CSRF protection where required.

Protect operations such as:

POST

PUT

PATCH

DELETE

especially:

\- create order

\- change password

\- admin operations

\- delete product

\- modify inventory

\- change user roles

\- update settings

Do not rely solely on CORS as CSRF protection.

==================================================

17\. CORS

==================================================

Audit CORS configuration.

Do NOT use:

Access-Control-Allow-Origin: \*

for authenticated/private APIs unless there is a documented reason.

Restrict origins to the actual application origins.

Do not allow arbitrary origins to make credentialed requests.

==================================================

18\. SECURITY HEADERS

==================================================

Implement appropriate HTTP security headers.

Review:

Content-Security-Policy

X-Content-Type-Options

Referrer-Policy

Permissions-Policy

Strict-Transport-Security

Frame protections

Do not blindly deploy an overly restrictive CSP that breaks the application.

Build a CSP compatible with the actual application.

Avoid:

unsafe-eval

unless absolutely required.

Minimize:

unsafe-inline

where practical.

==================================================

19\. RATE LIMITING

==================================================

Implement reasonable protection for sensitive endpoints.

At minimum review:

\- login

\- registration

\- password reset

\- session creation

\- search

\- review creation

\- coupon validation

\- checkout

\- admin authentication

Use Cloudflare-compatible mechanisms.

Do not introduce paid infrastructure.

Prevent trivial brute-force abuse.

==================================================

20\. DEMO CHECKOUT SECURITY

==================================================

This project currently uses DEMO payments.

The demo payment system must remain completely isolated from real financial systems.

Never create fake-looking real payment credentials.

Clearly mark:

DEMO PAYMENT

NO REAL MONEY CHARGED

The backend must create the demo order.

Never allow the frontend to submit:

"total = 1"

and have the backend trust it.

The server must calculate:

subtotal

discount

shipping

tax if applicable

total

from trusted database values.

==================================================

21\. PRICE MANIPULATION

==================================================

Audit all price calculations.

The frontend must NEVER be trusted for:

\- product price

\- discount

\- coupon value

\- total

\- inventory

\- shipping price

The backend must retrieve product/variant prices from D1.

For example:

Frontend:

price = €1

Backend:

D1 says €50

Backend must use €50.

==================================================

22\. INVENTORY SECURITY

==================================================

Prevent:

\- negative inventory

\- purchasing disabled variants

\- purchasing inactive products

\- purchasing unavailable products

\- race conditions

Use atomic/transactional D1 operations where appropriate.

Test two simultaneous orders attempting to purchase the last available item.

==================================================

23\. R2 SECURITY

==================================================

Audit all file uploads.

Validate:

\- MIME type

\- file extension

\- file size

\- image dimensions where appropriate

\- object key

\- upload authorization

Do not trust:

Content-Type

alone.

Do not allow arbitrary executable files to be uploaded as public assets.

Prevent:

path traversal

object key manipulation

unauthorized deletion

unauthorized replacement

Only authorized admins should be able to upload/delete admin-managed media.

==================================================

24\. R2 ACCESS CONTROL

==================================================

Determine which files are:

PUBLIC

PRIVATE

Product images may be public.

Private administrative files must not be publicly accessible.

Never expose R2 credentials to the browser.

Use Workers/backend access where necessary.

==================================================

25\. FILE DOWNLOAD SECURITY

==================================================

If the application exposes uploaded files:

\- validate requested object key

\- authorize access

\- prevent path traversal

\- prevent arbitrary bucket access

Never let users request arbitrary R2 keys.

==================================================

26\. ADMIN FILE UPLOADS

==================================================

Admin-only upload endpoints must verify:

Authentication

Session

Permission

before accepting uploads.

Do not merely hide the upload interface.

==================================================

27\. WEBHOOK SECURITY

==================================================

There are currently no real payment/email integrations.

However, audit existing webhook-style endpoints.

If any external webhook endpoint exists:

\- verify signatures

\- validate payload

\- prevent replay attacks where applicable

\- make processing idempotent

\- do not trust arbitrary webhook data

Do not create fake payment webhooks.

==================================================

28\. ERROR HANDLING

==================================================

Never expose:

\- SQL errors

\- stack traces

\- environment variables

\- secret values

\- internal file paths

\- database schema details

to end users.

Return safe errors.

Log detailed errors server-side.

Example:

Client:

"Something went wrong."

Server log:

detailed diagnostic information.

==================================================

29\. LOGGING SECURITY

==================================================

Audit all logs.

Never log:

\- passwords

\- session tokens

\- cookies

\- authorization headers

\- API keys

\- secrets

\- reset tokens

Be careful with:

IP addresses

emails

personal information

Only log what is necessary.

==================================================

30\. DEMO ACCOUNTS

==================================================

The demo needs convenient accounts for presentation.

However:

DO NOT hardcode demo passwords into frontend source code.

Do not put them in publicly accessible JavaScript.

Create a documented seed mechanism.

Use clearly fake demo accounts only.

Example:

admin@demo.local

customer@demo.local

These must contain NO real personal information.

If credentials are documented publicly, ensure they have absolutely no access to real infrastructure or real services.

==================================================

31\. SEED SECURITY

==================================================

Audit the seed scripts.

Seed data must NEVER contain:

\- real passwords

\- real email accounts

\- real API credentials

\- real customer data

\- real addresses

\- real phone numbers

\- real payment information

Use synthetic demo data only.

==================================================

32\. GITHUB SECURITY

==================================================

Review:

.github/workflows/

Ensure GitHub Actions do not expose secrets.

Use GitHub Secrets for sensitive CI/CD values.

Never echo secrets.

Avoid:

set -x

or equivalent secret-leaking behavior.

Use minimal GitHub token permissions.

Prefer:

permissions:

&#x20; contents: read

unless more permissions are actually required.

==================================================

33\. DEPENDENCY SECURITY

==================================================

Audit npm/package dependencies.

Check:

\- outdated dependencies

\- known vulnerabilities

\- unnecessary dependencies

\- abandoned packages

\- suspicious packages

Run the project's appropriate dependency audit.

Do not blindly upgrade everything.

Upgrade dependencies carefully and test the application afterward.

==================================================

34\. SOURCE MAPS

==================================================

Check whether production source maps expose sensitive source code.

If source maps are generated:

\- determine whether they are necessary

\- ensure they do not expose secrets

\- avoid publishing unnecessary internal source information

Never assume source maps are private if they are publicly accessible.

==================================================

35\. DEBUG / DEVELOPMENT MODE

==================================================

Production/demo deployment must NOT run with:

DEBUG=true

verbose error output

development-only endpoints

test authentication bypasses

mock admin bypasses

temporary backdoors

Disable or remove:

/debug

/test-auth

/dev-login

/admin-bypass

/mock-payment

unless they are explicitly designed as safe demo features.

==================================================

36\. DEMO MODE SAFETY

==================================================

If a DEMO\_MODE flag is used:

DEMO\_MODE must NOT bypass authentication or authorization.

It may only:

\- disable real payments

\- disable real email

\- enable demo data

\- label checkout as demo

It must NEVER:

\- bypass admin permissions

\- disable security

\- expose secrets

\- allow arbitrary database access

==================================================

37\. SECURITY TESTING

==================================================

Create automated tests for critical security behavior.

Test:

Authentication

Authorization

RBAC

IDOR

SQL injection resistance

XSS

CSRF

Rate limiting

Session security

Admin endpoints

File uploads

Inventory manipulation

Price manipulation

Coupon manipulation

Order access

User data access

At minimum verify:

Customer cannot access admin API.

Customer cannot access another customer's order.

Customer cannot modify product price.

Customer cannot modify inventory.

Customer cannot assign themselves admin.

Frontend cannot manipulate checkout total.

Frontend cannot manipulate product price.

Unauthorized user cannot delete R2 objects.

==================================================

38\. PUBLIC REPOSITORY FINAL SCAN

==================================================

Before completing the task, perform a final repository-wide secret scan.

Check:

\- working tree

\- Git tracked files

\- Git history

\- build output

\- configuration

\- documentation

\- tests

\- seed files

\- CI/CD files

The final repository must be safe to remain PUBLIC.

==================================================

39\. SECURITY DOCUMENTATION

==================================================

Create:

SECURITY.md

It should document:

\- how secrets are handled

\- environment variables

\- Cloudflare secrets

\- reporting security issues

\- supported environments

\- demo environment limitations

Do NOT put real credentials in SECURITY.md.

Also update:

README.md

with safe deployment instructions.

==================================================

40\. SECURITY CHECKLIST

==================================================

Create a checklist such as:

\[ ] No secrets in repository

\[ ] No secrets in Git history or known compromised secrets rotated

\[ ] .env ignored

\[ ] .env.example contains names only

\[ ] Cloudflare secrets configured externally

\[ ] No frontend secrets

\[ ] Admin RBAC enforced server-side

\[ ] IDOR protection implemented

\[ ] Parameterized D1 queries

\[ ] Input validation

\[ ] XSS protection

\[ ] CSRF protection where applicable

\[ ] CORS restricted

\[ ] Security headers

\[ ] Rate limiting

\[ ] Secure sessions

\[ ] Secure cookies

\[ ] R2 upload validation

\[ ] R2 authorization

\[ ] No debug endpoints

\[ ] Demo payment isolated

\[ ] Server-side price calculation

\[ ] Inventory protected against race conditions

\[ ] GitHub Actions secured

\[ ] Dependencies audited

\[ ] Production build tested

==================================================

41\. DO NOT BREAK CLOUDFLARE DEPLOYMENT

==================================================

The repository MUST remain PUBLIC.

Do NOT:

\- make the repository private

\- remove Cloudflare Pages integration

\- remove GitHub integration

\- commit Cloudflare credentials

\- disable automatic deployment

The final solution must work with:

PUBLIC GitHub repository

&#x20; ↓

Cloudflare Pages

&#x20; ↓

Cloudflare Workers

&#x20; ↓

D1 + R2

==================================================

42\. FINAL REPORT

==================================================

When finished, provide a concise security report containing:

1\. Vulnerabilities discovered.

2\. Vulnerabilities fixed.

3\. Files changed.

4\. Authentication changes.

5\. Authorization/RBAC changes.

6\. D1 security changes.

7\. R2 security changes.

8\. GitHub security changes.

9\. Environment variable changes.

10\. Cloudflare configuration changes.

11\. Tests performed.

12\. Remaining risks.

13\. Any secrets that MUST be rotated.

IMPORTANT:

NEVER print actual secrets in the report.

If a secret was discovered, report only:

"Potential secret found in <location>; rotation recommended."

Do not reveal its value.

==================================================

FINAL REQUIREMENT

==================================================

The repository must remain PUBLIC and safe to expose publicly.

Treat the entire GitHub repository as visible to an attacker.

Anything that must remain secret must exist ONLY in:

\- Cloudflare Secrets

\- GitHub Secrets

\- local untracked .env files

and NEVER in source code, database seed data, documentation, frontend bundles, or Git history.

Do not declare the task complete until the application has been audited, hardened, tested, and verified to remain deployable through Cloudflare Pages from the public GitHub repository.
Я бы ещё добавил одну важную вещь

Для презентации тебе не обязательно показывать 40+ товаров на каждом экране. Лучше сделать базу достаточно большой, но на главной визуально показать, например:

8 Featured
8 New Arrivals
8 Sale
6 Best Sellers

А в каталоге уже пусть будут все 40+.

И обязательно сделай готовый Demo Account, чтобы reviewer не искал, как зарегистрироваться:

Customer Demo
customer@demo.local

Admin Demo
admin@demo.local

При этом пароли лучше выдавать отдельно в документации/README, а не в клиентском коде.

Что должно быть готово для презентации

По сути, твой MVP approval должен доказать 5 вещей:

1. UX: сайт выглядит как настоящий fashion marketplace.
2. Functionality: пользователь реально может совершить полный demo-покупательский путь.
3. Admin: весь контент управляется из админки.
4. Data: база не пустая, есть реальные взаимосвязи products → variants → inventory → orders → reviews.
5. Infrastructure: всё работает на Cloudflare без платных внешних сервисов.

Payment, email, real shipping, refunds и production analytics сейчас я бы действительно не делал. Их можно добавить после одобрения, не ломая текущую архитектуру.
