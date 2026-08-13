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
==================================================

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

==================================================
2. DATABASE
==================================================

Use the existing repository database structure as the source of truth.

The current project contains approximately 43 tables covering:

- users
- user_sessions
- addresses
- roles
- permissions
- role_permissions
- user_roles
- customer_support_notes
- brands
- categories
- products
- product_variants
- product_images
- product_attributes
- product_attribute_values
- campaigns
- campaign_products
- inventory_balances
- inventory_movements
- inventory_reservations
- carts
- cart_items
- wishlists
- wishlist_items
- coupons
- promotions
- orders
- order_items
- order_status_history
- payments
- payment_events
- shipments
- shipment_events
- return_requests
- return_items
- refunds
- notifications
- newsletter_subscriptions
- audit_logs
- site_settings
- content_pages
- uploaded_files
- background_job_records
- product_reviews

Preserve the business model.

Do not remove functionality simply because this is a demo.

==================================================
3. CLOUDFLARE ARCHITECTURE
==================================================

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

==================================================
4. DATABASE MIGRATION TO D1
==================================================

The existing project is PostgreSQL-oriented.

Adapt the database layer for Cloudflare D1/SQLite.

Do NOT blindly execute PostgreSQL migrations against D1.

Create a clean D1-compatible schema and migration system.

Convert PostgreSQL-specific features appropriately:

ENUM
→ TEXT with application-level validation

JSONB
→ TEXT containing JSON

TEXT[]
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

==================================================
5. SEED A REALISTIC DEMO DATABASE
==================================================

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

==================================================
6. DEMO PRODUCT CATALOG
==================================================

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

==================================================
7. PRODUCT VARIANTS
==================================================

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

==================================================
8. PRODUCT IMAGES
==================================================

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

==================================================
9. HOMEPAGE
==================================================

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

==================================================
10. PRODUCT PAGE
==================================================

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

==================================================
11. SEARCH / FILTERS / SORTING
==================================================

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

==================================================
12. CART
==================================================

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

==================================================
13. DEMO CHECKOUT
==================================================

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

==================================================
14. INVENTORY
==================================================

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

==================================================
15. ORDERS
==================================================

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

==================================================
16. ADMIN PANEL
==================================================

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
Roles & Permissions
Audit Logs
Settings

Do not create empty admin pages.

Every important section should contain realistic seeded data.

==================================================
17. ADMIN PRODUCT MANAGEMENT
==================================================

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

==================================================
18. REVIEWS
==================================================

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

==================================================
19. COUPONS
==================================================

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

==================================================
20. WISHLIST
==================================================

Implement:

- add
- remove
- view
- move to cart

for authenticated users.

==================================================
21. AUTHENTICATION
==================================================

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

==================================================
22. DEMO DATA
==================================================

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

==================================================
23. CMS
==================================================

Seed realistic content pages:

About Us
Shipping
Returns
Size Guide
Privacy
Terms
Contact

The content must be editable through admin.

==================================================
24. SIZE GUIDE
==================================================

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

==================================================
25. UI/UX
==================================================

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

==================================================
26. RESPONSIVENESS
==================================================

Test:

Mobile
Tablet
Desktop
Large desktop

Important flows must work without horizontal scrolling.

==================================================
27. SECURITY
==================================================

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

==================================================
28. DEMO ENVIRONMENT
==================================================

Clearly define this environment as:

DEMO / STAGING

There must be no possibility of accidentally charging real money.

Do not connect real payment providers.

Do not send real transactional emails.

Do not create real financial transactions.

==================================================
29. PERFORMANCE
==================================================

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

==================================================
30. ERROR HANDLING
==================================================

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

==================================================
31. OBSERVABILITY
==================================================

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

==================================================
32. ENVIRONMENT VARIABLES
==================================================

Create a clean environment configuration.

Document:

Development
Preview
Production/Demo

Do not commit secrets.

Create/update:

.env.example

Document all required variables.

==================================================
33. CLOUDFLARE CONFIGURATION
==================================================

Create/update the Cloudflare configuration so that the project can be deployed cleanly.

Configure:

D1
R2
Workers
Pages

Use appropriate bindings.

Do not hardcode Cloudflare account IDs or secrets.

==================================================
34. DATABASE SEED COMMAND
==================================================

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

==================================================
35. DEMO RESET
==================================================

Create a safe development/demo reset mechanism.

Example:

npm run db:reset-demo

This should reset ONLY the demo environment.

Never create a command that can accidentally wipe production data without an explicit environment check.

==================================================
36. TESTING
==================================================

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

==================================================
37. DO NOT BREAK EXISTING FUNCTIONALITY
==================================================

Before modifying existing code:

Understand how it works.

Do not rewrite the entire application unnecessarily.

Prefer targeted refactoring.

Preserve existing UI/UX where it is already good.

Improve it where necessary.

==================================================
38. NO PLACEHOLDERS
==================================================

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

==================================================
39. FINAL QUALITY CHECK
==================================================

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

==================================================
40. FINAL DELIVERABLE
==================================================

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