I updated the architecture so **all core functionality works locally without paid external services**, while keeping the frontend independent and compatible with a future Cloudflare Pages deployment. Cloudflare-specific services are treated as production adapters rather than local-development requirements.

Act as a senior software architect, product manager, database engineer, security engineer, QA engineer, DevOps engineer, and full-stack developer.

Your task is to design and build a production-ready, local-first MVP for an online outlet marketplace inspired by the business model and functionality of Lounge by Zalando.

Use Lounge by Zalando only as functional inspiration. Do not copy its source code, branding, copyrighted assets, text, logos, product images, or exact visual design.

The complete application must work locally for development and testing without requiring paid external services.

The architecture must also be prepared for a future deployment where the customer storefront and administration panel can be hosted on Cloudflare Pages.

Do not deploy the application during the first implementation. Create a working local version first.

# 1. Main objective

Create an outlet e-commerce platform where customers can purchase limited-stock products from brands such as:

* Adidas
* Nike
* Puma
* Tommy Hilfiger
* Calvin Klein
* Other fashion, sportswear, footwear, and lifestyle brands

The platform must focus on:

* Outlet and discounted products
* Limited quantities
* Time-limited campaigns
* Product variants such as size and color
* Safe inventory reservation
* A 20-minute reservation timer
* Reliable checkout
* Local test payments
* Customer accounts
* Order management
* Returns and refunds
* Complete administration panel
* Future production scalability
* Future Cloudflare Pages compatibility

The first working version must prioritize:

* Correct business logic
* Reliable inventory handling
* Security
* Clean architecture
* Maintainable code
* Complete local functionality
* Automated testing

Do not spend significant development time on:

* Advanced animations
* Heavy visual effects
* Complex promotional transitions
* Highly polished graphics
* Advanced UX experiments
* Custom design systems

Use a simple, clean, accessible, responsive interface that can be redesigned later.

# 2. Mandatory local-first requirement

The entire application must be fully usable on a developer’s local computer.

A developer must be able to clone the repository and start the complete project using a small number of commands.

Preferred startup command:

```bash
docker compose up --build
```

Alternatively, provide:

```bash
pnpm install
pnpm local:up
```

After startup, the following local services must be available:

```text
Customer storefront: http://localhost:3000
Admin panel:         http://localhost:3001
Backend API:         http://localhost:4000
API documentation:   http://localhost:4000/docs
Mail testing UI:     http://localhost:8025
Object storage UI:   http://localhost:9001
PostgreSQL:          localhost:5432
Redis:               localhost:6379
```

Ports may be changed if necessary, but they must be clearly documented.

The local application must not require:

* A Cloudflare account
* A Stripe account
* An AWS account
* An external email provider
* An external object-storage provider
* A production domain
* Paid APIs
* Remote databases
* Remote Redis
* Remote queues

All important flows must be testable locally.

# 3. Local service replacements

Use local development adapters for external services.

## Database

Use PostgreSQL locally through Docker Compose.

PostgreSQL must be the authoritative source for:

* Products
* Product variants
* Inventory
* Reservations
* Customers
* Orders
* Payments
* Returns
* Refunds
* Audit logs

## Redis

Run Redis locally through Docker Compose.

Use it for:

* Reservation expiration scheduling
* Short-lived caching
* Rate limiting
* Distributed locking where appropriate
* Background-job queues
* Cart-related temporary data

Do not make Redis the only authoritative source for stock or reservations.

## Object storage

Use MinIO locally as an S3-compatible object-storage service.

It must support:

* Product images
* Campaign images
* Brand logos
* Uploaded CSV files
* Generated invoices where applicable

Implement object storage through an interface such as:

```ts
interface ObjectStorageProvider {
  upload(...): Promise<StoredFile>;
  delete(...): Promise<void>;
  getPublicUrl(...): string;
}
```

Provide at least:

* `MinioStorageProvider` for local development
* `S3CompatibleStorageProvider`
* A future `CloudflareR2StorageProvider`

Do not store uploaded files permanently on the application server’s local filesystem.

## Email

Use Mailpit or MailHog locally.

All local emails must be visible through a browser interface.

Test these local email flows:

* Email verification
* Password reset
* Order confirmation
* Payment failure
* Shipment notification
* Return status
* Refund confirmation

Create an email-provider interface with:

* Local SMTP adapter
* Future production email adapter

## Payments

Create a fully functional local mock payment provider.

The mock payment provider must support:

* Successful payment
* Failed payment
* Cancelled payment
* Delayed payment
* Duplicate webhook simulation
* Full refund
* Partial refund

Provide test payment controls on the local checkout page.

Example local test options:

```text
TEST-SUCCESS
TEST-FAIL
TEST-CANCEL
TEST-DELAYED
```

The application must complete the entire order flow using the mock payment provider.

Also create a Stripe adapter behind the same payment interface, but Stripe must remain optional for local development.

The system must select the provider through environment variables:

```env
PAYMENT_PROVIDER=mock
```

Possible future value:

```env
PAYMENT_PROVIDER=stripe
```

# 4. Business model

The website must support two methods of selling products.

## Permanent outlet catalog

Products remain available until:

* Their stock reaches zero
* They are disabled
* Their publication period ends
* An administrator archives them

## Time-limited campaigns

Administrators can create campaigns such as:

* Adidas Outlet Sale
* Summer Shoes Sale
* Sportswear Weekend
* Up to 60% Off Nike
* Designer Accessories Sale

Each campaign must have:

* Title
* Slug
* Short description
* Full description
* Cover image
* Start date and time
* End date and time
* Status
* Assigned products
* Campaign-specific prices
* Campaign-specific quantity limits
* Display order
* Visibility settings
* SEO metadata

Campaigns must automatically become active and inactive according to their configured dates.

Suggested campaign statuses:

* `DRAFT`
* `SCHEDULED`
* `ACTIVE`
* `PAUSED`
* `ENDED`
* `ARCHIVED`

# 5. Recommended project architecture

Use a modular monolith for the first version.

Do not use microservices for the MVP.

Use a monorepo.

Suggested structure:

```text
/apps
  /storefront
  /admin
  /api
  /worker

/packages
  /database
  /domain
  /auth
  /payments
  /storage
  /email
  /queue
  /ui
  /types
  /validation
  /config
  /eslint-config
  /typescript-config

/infrastructure
  /docker
  /cloudflare
  /scripts

/docs
```

## Storefront

Use:

* Next.js
* React
* TypeScript
* Tailwind CSS
* React Hook Form
* Zod
* TanStack Query where appropriate
* Accessible headless components

## Admin panel

Use a separate Next.js application.

The admin panel must have:

* Separate routes
* Separate access controls
* Role-based permissions
* Its own Cloudflare Pages build configuration
* Shared UI components where appropriate

## Backend API

Use:

* TypeScript
* NestJS
* REST API
* OpenAPI/Swagger
* DTO validation
* Structured application modules
* Dependency injection
* Background jobs
* Provider interfaces for external services

The API must remain independently deployable from the frontend.

Do not make the frontend depend on Next.js API routes for critical business logic.

All important business logic must live in the backend API or shared domain packages.

## Worker application

Create a separate worker process for:

* Reservation expiration
* Email sending
* Payment-event processing
* Campaign activation
* Campaign expiration
* Inventory cleanup
* Retryable background tasks

Use BullMQ with local Redis for the first version.

Design queue interfaces so BullMQ can later be replaced with:

* Cloudflare Queues
* Cloudflare Workflows
* Another managed queue provider

# 6. Cloudflare Pages future readiness

The storefront and admin applications must be prepared for a future Cloudflare Pages deployment.

Cloudflare deployment is not required for the first local MVP, but the project must include the necessary architecture and documentation.

## Cloudflare deployment model

Prepare for this future mapping:

```text
Storefront frontend  -> Cloudflare Pages
Admin frontend       -> Cloudflare Pages
Static assets        -> Cloudflare CDN
Product images       -> Cloudflare R2
API                   -> Independent backend or Cloudflare Workers
Database              -> Managed PostgreSQL
Database acceleration -> Cloudflare Hyperdrive where appropriate
Background jobs       -> Cloudflare Queues or Workflows
Bot protection        -> Cloudflare Turnstile
```

Cloudflare Pages must not be treated as the database or the complete backend.

The frontend and API must be independently deployable.

## Frontend requirements for Cloudflare Pages

The storefront and admin applications must:

* Avoid Vercel-only services
* Avoid hardcoded localhost URLs
* Avoid hardcoded production URLs
* Use environment variables for API endpoints
* Avoid writing uploaded files to the application filesystem
* Avoid unsupported Node.js native modules in frontend code
* Keep server-only logic out of browser bundles
* Support separate local, staging, and production configurations
* Support configurable asset and image domains
* Support Cloudflare-compatible builds
* Be compatible with the current officially supported Cloudflare Next.js deployment adapter at deployment time

Use variables such as:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
NEXT_PUBLIC_ASSET_BASE_URL=http://localhost:9000
```

Production values must be configurable without code changes.

## API portability

The backend must not assume that it is hosted on the same domain as the frontend.

Implement configurable:

* CORS
* Trusted origins
* Cookie domains
* Secure-cookie behavior
* Proxy headers
* API base URLs
* Webhook URLs
* Asset URLs

Create an environment adapter for runtime-specific configuration.

Keep core domain logic independent from:

* NestJS controllers
* Redis
* BullMQ
* Cloudflare APIs
* Stripe
* MinIO
* Specific email providers

## Cloudflare configuration files

Include future-ready configuration examples under:

```text
/infrastructure/cloudflare
```

Include:

* Storefront Pages build notes
* Admin Pages build notes
* Environment variable list
* Redirect examples
* Header examples
* SPA fallback rules where relevant
* Cache policy notes
* R2 integration notes
* Turnstile integration notes
* API CORS notes
* Custom-domain notes

Do not include fake credentials.

# 7. Critical inventory-reservation system

Inventory reservation is the most important part of the platform.

Example:

An Adidas T-shirt in size M has one unit in stock.

When Customer A adds the SKU to the cart:

1. The SKU must immediately be reserved for Customer A.
2. The reservation must last for exactly 20 minutes by default.
3. Customer B must not be able to reserve or purchase that unit.
4. Customer A must see a countdown timer.
5. Refreshing the page must not reset the timer.
6. Closing and reopening the browser must not reset a valid persistent cart timer.
7. Logging in after adding the product must not reset the timer.
8. The server must be authoritative for reservation expiration.
9. When the reservation expires, the unit must become available again.
10. If payment succeeds, the reservation must become an order allocation.
11. Simultaneous attempts for the final unit must never both succeed.

The reservation duration must be configurable in admin settings.

Default value:

```text
20 minutes
```

## Reservation implementation

Use PostgreSQL and Redis appropriately.

PostgreSQL must remain authoritative.

Every reservation must have:

* Unique ID
* Cart ID
* Customer ID or anonymous session ID
* Product variant ID
* Quantity
* Status
* Creation timestamp
* Expiration timestamp
* Conversion timestamp
* Cancellation reason
* Associated order ID where applicable

Suggested reservation statuses:

* `ACTIVE`
* `CHECKOUT_STARTED`
* `PAYMENT_PROCESSING`
* `CONVERTED`
* `EXPIRED`
* `CANCELLED`

Reservation creation must use:

* A database transaction
* Row locking or atomic conditional updates
* A safe stock check
* Idempotency protection

Never calculate availability only in frontend code.

Never trust quantities submitted by the browser.

Never allow negative stock.

## Inventory fields

Maintain values such as:

* `onHandQuantity`
* `reservedQuantity`
* `soldQuantity`
* `damagedQuantity`
* `returnedQuantity`

Available quantity must be derived safely.

Conceptually:

```text
available = on hand - reserved - sold - damaged
```

Adjust the exact model if using inventory movements, but document the decision.

## Reservation expiration

Create a background worker that:

* Finds expired reservations
* Marks them expired
* Releases their inventory
* Removes or disables expired cart items
* Publishes an event for frontend updates
* Produces an audit record

Expiration must also be checked during:

* Cart loading
* Cart updates
* Checkout start
* Payment creation
* Order creation

Background jobs may be delayed. Therefore, a delayed worker must never allow an expired reservation to be used.

All reservation release operations must be idempotent.

# 8. Cart requirements

The cart must support:

* Anonymous users
* Logged-in users
* Anonymous cart persistence
* Cart merging after login
* Product variants
* Quantity changes
* Per-item reservation expiration
* Visible countdown timers
* Automatic handling of expired items
* Server-side validation
* Price recalculation
* Discount recalculation
* Delivery estimation
* Tax calculation support
* Coupons
* Persistent cart between refreshes
* Clear out-of-stock and expiration messages

The frontend timer is only a visual representation.

The frontend must request the authoritative `expiresAt` value from the API.

Do not extend a reservation merely because the user:

* Refreshes
* Reopens the cart
* Starts checkout
* Logs in
* Changes pages

Any extension policy must be explicit, server-side, configurable, and protected from abuse.

# 9. Checkout and payment

Create this checkout flow:

1. Cart validation
2. Customer information
3. Shipping address
4. Billing address
5. Shipping method
6. Coupon validation
7. Final review
8. Payment
9. Order confirmation

Before payment, verify:

* Reservations are active
* Reservations have not expired
* Products are still enabled
* Campaigns are still valid
* Prices are current
* Discounts are valid
* Shipping information is valid
* Inventory remains allocated

The backend must recalculate all totals.

Never trust totals submitted by the frontend.

## Payment-provider interface

Create an interface such as:

```ts
interface PaymentProvider {
  createPayment(...): Promise<PaymentSession>;
  verifyWebhook(...): Promise<VerifiedPaymentEvent>;
  refund(...): Promise<RefundResult>;
  cancel(...): Promise<CancelResult>;
}
```

Provide:

* `MockPaymentProvider`
* `StripePaymentProvider`

## Payment requirements

Support:

* Idempotency keys
* Signed or authenticated local webhook simulation
* Stripe webhook verification when Stripe is enabled
* Duplicate-event prevention
* Payment status history
* Failed payments
* Cancelled payments
* Full refunds
* Partial refunds
* Delayed payment confirmation

Never mark an order paid based only on a frontend redirect.

Suggested payment statuses:

* `PENDING`
* `PROCESSING`
* `AUTHORIZED`
* `PAID`
* `FAILED`
* `CANCELLED`
* `PARTIALLY_REFUNDED`
* `REFUNDED`

Suggested order statuses:

* `DRAFT`
* `AWAITING_PAYMENT`
* `PAID`
* `PROCESSING`
* `PACKED`
* `SHIPPED`
* `DELIVERED`
* `CANCELLED`
* `RETURN_REQUESTED`
* `PARTIALLY_RETURNED`
* `RETURNED`

Define a safe policy for payment events received after reservation expiration.

Do not silently oversell.

# 10. Customer website structure

Create these pages.

## Authentication and legal pages

* Registration
* Login
* Email verification
* Forgot password
* Reset password
* Privacy policy
* Terms and conditions
* Cookie policy
* Contact page
* FAQ
* Shipping information
* Returns information

## Store pages

* Home
* Active campaigns
* Upcoming campaigns
* Campaign details
* Outlet catalog
* Category page
* Brand page
* Search results
* Product details
* Cart
* Checkout
* Order confirmation
* Wishlist
* Recently viewed

## Customer account

* Account overview
* Personal information
* Saved addresses
* Order history
* Order details
* Shipment tracking
* Return request
* Refund status
* Wishlist
* Notification preferences
* Password and security settings

# 11. Home page

Keep the MVP design simple.

Include:

* Header
* Logo placeholder
* Search
* Category navigation
* Account link
* Wishlist link
* Cart count
* Active campaigns
* Upcoming campaigns
* Featured brands
* Recently added products
* Best discounts
* Newsletter form
* Footer

Do not build complex animations.

# 12. Product catalog

Products must support:

* Name
* Slug
* Brand
* Short description
* Full description
* Category
* Subcategory
* Target group
* Materials
* Care instructions
* Country of origin
* Images
* Original price
* Outlet price
* Campaign price
* Discount percentage
* Tax class
* Status
* Publication dates
* SEO title
* SEO description
* Search keywords

Every sellable combination must be a separate variant or SKU.

Example:

```text
Product: Adidas Essentials T-Shirt

Variants:
ADIDAS-ESS-TS-BLACK-S
ADIDAS-ESS-TS-BLACK-M
ADIDAS-ESS-TS-BLACK-L
ADIDAS-ESS-TS-WHITE-S
ADIDAS-ESS-TS-WHITE-M
```

Variants must support:

* SKU
* Barcode
* Size
* Color
* Additional attributes
* Price override
* Weight
* Dimensions
* Stock quantity
* Reserved quantity
* Enabled status
* Variant images

# 13. Search and filters

Support filters for:

* Category
* Brand
* Size
* Color
* Target group
* Price
* Discount percentage
* Availability
* Campaign
* Product attributes

Support sorting by:

* Recommended
* Newest
* Price ascending
* Price descending
* Highest discount
* Popularity

Use PostgreSQL-backed search for the MVP.

Create a search abstraction so it can later use:

* Meilisearch
* OpenSearch
* Elasticsearch
* Algolia

# 14. Administration panel

Create a complete protected administration panel.

## Dashboard

Show:

* Revenue
* Order count
* Average order value
* Low-stock products
* Active reservations
* Expired reservations
* Failed payments
* Active campaigns
* Upcoming campaigns
* Recent orders
* Return requests
* Sales by day
* Sales by brand
* Sales by campaign

Simple cards and tables are enough for the first version.

## Product management

Administrators must be able to:

* Create products
* Edit products
* Duplicate products
* Archive products
* Enable or disable products
* Manage variants
* Upload images
* Reorder images
* Assign brands
* Assign categories
* Assign campaigns
* Set prices
* Schedule publication
* Edit SEO information
* Perform bulk updates
* Import CSV
* Export CSV

## Inventory management

Administrators must be able to:

* View stock by SKU
* Increase stock
* Decrease stock
* Correct stock
* Mark stock damaged
* View reservations
* View available quantities
* Cancel reservations with a reason
* View inventory movements
* Import inventory
* Export inventory

Every adjustment must record:

* Administrator
* SKU
* Previous value
* New value
* Difference
* Reason
* Date and time

## Campaign management

Administrators must be able to:

* Create campaigns
* Edit campaigns
* Schedule campaigns
* Activate campaigns
* Pause campaigns
* End campaigns
* Assign products
* Remove products
* Set campaign prices
* Set campaign quantity limits
* Upload campaign images
* Reorder products
* Preview campaigns

## Order management

Administrators must be able to:

* Search orders
* Filter orders
* View order details
* View payment history
* Change fulfillment status
* Add internal notes
* Cancel eligible orders
* Create refunds
* Print invoices
* Print packing slips
* Add tracking numbers
* Resend emails
* View order history

## Customer management

Administrators must be able to:

* Search customers
* View customer profiles
* View order history
* View addresses
* Disable accounts
* Re-enable accounts
* Add support notes
* View returns
* View refunds

Passwords must never be visible.

## Discounts and coupons

Support:

* Fixed discounts
* Percentage discounts
* Minimum order values
* Maximum discount values
* Start and end dates
* Total usage limits
* Per-customer limits
* Brand restrictions
* Category restrictions
* Product restrictions
* Campaign restrictions
* First-order-only discounts
* Active status

## Returns and refunds

Administrators must be able to:

* Review return requests
* Approve or reject returns
* Record received items
* Record item condition
* Restock eligible products
* Issue full refunds
* Issue partial refunds
* Add internal notes
* View status history

Returned items must not automatically return to available inventory unless approved as resellable.

## Content management

Support basic management for:

* Home sections
* Banners
* FAQ
* Terms
* Privacy policy
* Shipping policy
* Return policy
* Contact information
* Footer links

# 15. Roles and permissions

Implement granular role-based access control.

Suggested roles:

* Super Admin
* Catalog Manager
* Inventory Manager
* Order Manager
* Customer Support
* Marketing Manager
* Finance Manager
* Read-only Analyst

Example permissions:

* `products.create`
* `products.update`
* `products.archive`
* `inventory.view`
* `inventory.adjust`
* `reservations.cancel`
* `orders.update`
* `orders.cancel`
* `refunds.create`
* `campaigns.publish`
* `customers.disable`
* `settings.update`
* `audit_logs.view`

# 16. Database entities

Design entities for at least:

* User
* UserSession
* Address
* Role
* Permission
* UserRole
* Brand
* Category
* Product
* ProductVariant
* ProductImage
* ProductAttribute
* ProductAttributeValue
* Campaign
* CampaignProduct
* InventoryBalance
* InventoryMovement
* Cart
* CartItem
* InventoryReservation
* Wishlist
* WishlistItem
* Coupon
* Promotion
* Order
* OrderItem
* OrderStatusHistory
* Payment
* PaymentEvent
* Shipment
* ReturnRequest
* ReturnItem
* Refund
* Notification
* NewsletterSubscription
* AuditLog
* SiteSetting
* UploadedFile
* BackgroundJobRecord

Add appropriate:

* Primary keys
* Foreign keys
* Unique constraints
* Check constraints
* Indexes
* Timestamps
* Archiving fields
* Optimistic-lock fields where useful

Order items must store product snapshots so historical orders do not change when products are edited.

# 17. Authentication and security

Implement:

* Email and password authentication
* Argon2 password hashing
* Email verification
* Password reset
* HttpOnly cookies
* Secure cookies in production
* SameSite configuration
* CSRF protection where required
* Rate limiting
* Login-attempt protection
* Session revocation
* Input validation
* Output sanitization
* Secure upload validation
* Role-based access control
* Admin route protection
* Audit logging
* Webhook verification
* Secret management
* Configurable trusted origins

Prepare optional Cloudflare Turnstile support through a captcha-provider interface.

Local development must support a disabled or local-test captcha mode.

Protect against common OWASP vulnerabilities.

# 18. Localization and money

Prepare for:

* Multiple languages
* Multiple currencies
* Localized products
* Localized categories
* Localized campaigns
* Localized static pages
* Localized emails

Use one default language and currency for the MVP.

Do not hardcode them throughout the application.

Store money as integer minor units.

Do not use floating-point values for prices.

# 19. Testing requirements

Create unit, integration, concurrency, and end-to-end tests.

## Unit tests

Test:

* Price calculation
* Discount calculation
* Stock availability
* Reservation expiration
* Permission checks
* Coupon validation
* Order totals
* Refund totals

## Integration tests

Test:

* Reservation creation
* Reservation release
* Simultaneous reservations
* Checkout validation
* Mock payment processing
* Duplicate payment events
* Order creation
* Refund processing
* Inventory adjustment
* Cart merging

## End-to-end tests

Use Playwright.

Test:

* Registration
* Email verification through Mailpit
* Login
* Product browsing
* Adding the final unit
* Countdown persistence
* Reservation expiration
* Successful local payment
* Failed local payment
* Admin login
* Product creation
* Inventory adjustment
* Campaign creation
* Order processing
* Return processing
* Refund processing

## Concurrency test

Create an automated test where:

1. A variant has one available unit.
2. One hundred requests try to reserve it concurrently.
3. Exactly one request succeeds.
4. Ninety-nine requests fail with an out-of-stock response.
5. Stock values remain correct.
6. No quantity becomes negative.

# 20. Local seed data

Create realistic local data containing:

* At least five brands
* At least five categories
* At least twenty products
* Multiple sizes
* Multiple colors
* One-unit products
* Multi-unit products
* Three active campaigns
* Two upcoming campaigns
* Example coupons
* Example customers
* Example orders
* Example returns
* Admin accounts for major roles

Provide documented local credentials such as:

```text
Super Admin:
admin@example.local
Admin123!

Customer:
customer@example.local
Customer123!
```

Use these credentials only in local seed data.

Never use them in production.

# 21. Environment configuration

Provide:

* `.env.example`
* `.env.local.example`
* `.env.test.example`
* Production variable documentation

Example local variables:

```env
NODE_ENV=development

STOREFRONT_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001
API_URL=http://localhost:4000

DATABASE_URL=postgresql://outlet:outlet@postgres:5432/outlet
REDIS_URL=redis://redis:6379

STORAGE_PROVIDER=minio
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_BUCKET=outlet-local
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123

EMAIL_PROVIDER=smtp
SMTP_HOST=mailpit
SMTP_PORT=1025

PAYMENT_PROVIDER=mock

RESERVATION_DURATION_MINUTES=20
```

Do not commit real secrets.

# 22. Docker Compose

Create a Docker Compose configuration containing:

* PostgreSQL
* Redis
* MinIO
* MinIO bucket initialization
* Mailpit
* API
* Background worker
* Storefront
* Admin panel

Add health checks.

Ensure startup ordering is handled correctly.

Database migrations and seed data must run through documented commands.

Provide commands such as:

```bash
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
pnpm local:reset
```

`pnpm local:reset` should:

* Stop local containers
* Remove development volumes
* Restart services
* Run migrations
* Insert seed data

# 23. Local acceptance criteria

The local MVP is complete only when a developer can:

1. Clone the repository.
2. Copy the example environment file.
3. Start Docker Compose.
4. Open the storefront.
5. Register a customer.
6. View the verification email in Mailpit.
7. Verify the account.
8. Browse products and campaigns.
9. Add a final-stock product to the cart.
10. See the 20-minute timer.
11. Confirm the product is unavailable to another user.
12. Complete a mock payment.
13. See the confirmed order.
14. Log in to the admin panel.
15. Create a product.
16. Add product variants.
17. Upload an image to MinIO.
18. Change inventory.
19. Create a campaign.
20. Process an order.
21. Create a return.
22. Issue a mock refund.
23. Run all automated tests successfully.

# 24. Future production deployment

Prepare but do not execute production deployment.

Document two possible backend deployment strategies.

## Strategy A: Cloudflare frontend with independent backend

```text
Storefront -> Cloudflare Pages
Admin      -> Cloudflare Pages
API        -> Container hosting platform
Worker     -> Container hosting platform
Database   -> Managed PostgreSQL
Redis      -> Managed Redis
Storage    -> Cloudflare R2
```

## Strategy B: deeper Cloudflare migration

```text
Storefront      -> Cloudflare Pages
Admin           -> Cloudflare Pages
API             -> Cloudflare Workers
PostgreSQL      -> Managed PostgreSQL through Hyperdrive
Object storage  -> Cloudflare R2
Queues          -> Cloudflare Queues
Workflows       -> Cloudflare Workflows
Captcha         -> Cloudflare Turnstile
```

Do not force Strategy B during the local MVP.

Keep provider interfaces and domain separation strong enough to make future migration possible.

# 25. CI requirements

Create a CI workflow that runs:

* Dependency installation
* Formatting checks
* Linting
* Type checking
* Unit tests
* Integration tests
* Production builds
* Migration validation

Create separate build checks for:

* Storefront
* Admin panel
* API
* Worker

Add a Cloudflare Pages compatibility build check for the storefront and admin applications.

Do not deploy automatically unless deployment is explicitly configured later.

# 26. Implementation order

Work in this order:

1. Document assumptions.
2. Present the architecture.
3. Create the monorepo.
4. Configure TypeScript, linting, and formatting.
5. Create Docker Compose.
6. Configure PostgreSQL, Redis, MinIO, and Mailpit.
7. Create the database schema.
8. Create migrations and seed data.
9. Implement authentication.
10. Implement roles and permissions.
11. Implement brands and categories.
12. Implement products and variants.
13. Implement inventory movements.
14. Implement concurrency-safe reservations.
15. Implement carts.
16. Implement campaigns.
17. Implement mock payments.
18. Implement checkout.
19. Implement orders.
20. Implement the customer account.
21. Implement the admin panel.
22. Implement returns and refunds.
23. Implement background jobs.
24. Add automated tests.
25. Add Cloudflare preparation files.
26. Run linting, type checking, tests, and builds.
27. Fix all detected problems.
28. Verify the complete local acceptance flow.

Do not begin with visual polishing.

# 27. Expected output

Provide:

* Complete architecture explanation
* Important technical decisions
* Monorepo structure
* Working Docker Compose setup
* Database schema
* Database migrations
* Seed data
* API routes
* Reservation algorithm
* Payment state machine
* Order state machine
* Admin permission model
* Working storefront
* Working admin panel
* Working backend API
* Working background worker
* Local MinIO integration
* Local Mailpit integration
* Local mock payment flow
* Automated tests
* `.env.example`
* README
* Local setup documentation
* Cloudflare Pages preparation guide
* Future R2 migration guide
* Future Cloudflare deployment architecture

Do not provide only:

* Mockups
* Pseudocode
* Architecture diagrams
* Empty project folders
* Incomplete demonstrations

Do not leave critical features as:

* TODO comments
* Empty handlers
* Fake frontend-only inventory
* Frontend-only reservation timers
* Hardcoded product arrays
* Mock authorization
* Unverified payment success
* Placeholder admin permissions
* Unimplemented background jobs
* External-service requirements for local testing

When a decision is not specified, choose the safest and simplest production-ready solution, document the assumption, and continue without stopping for unnecessary questions.

The MVP is considered complete when the complete customer, payment, reservation, administration, return, and refund flows work locally, all tests pass, and the storefront and administration panel are architecturally ready for a future Cloudflare Pages deployment.

This version makes local development the source of truth while separating services through adapters, so MinIO, Mailpit, mock payments, and local queues can later be replaced without rewriting the core business logic.
