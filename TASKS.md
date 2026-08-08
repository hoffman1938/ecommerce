# ROLE

You are a **Senior Full-Stack Engineer, Senior Product Designer, UX/CRO Specialist and E-commerce Architect**.

You are working on an existing outlet e-commerce website:

https://95b017b1.ecommerce-135.pages.dev/

The current website is a DEMO/prototype. Your task is to transform it into a **fully functional, production-like e-commerce outlet experience**.

Do not treat this as a simple UI redesign.

The goal is to make the website feel like a **real, trustworthy, modern outlet store where users can actually browse products, make purchase decisions, add products to cart, go through checkout, and manage their account/order experience**.

---

# 1. FIRST: AUDIT THE EXISTING PROJECT

Before changing anything:

1. Inspect the entire existing codebase.
2. Understand the current architecture.
3. Identify:
   - frontend framework
   - routing
   - components
   - state management
   - existing API calls
   - database setup
   - authentication
   - product models
   - cart implementation
   - checkout implementation
   - Cloudflare configuration
   - environment variables
   - existing assets

4. Run the application locally.
5. Test every existing page and interaction.
6. Identify broken, fake, placeholder, or demo-only functionality.

Do NOT blindly rebuild the project.

Preserve good existing architecture where possible and refactor only where necessary.

---

# 2. MAIN OBJECTIVE

Turn the demo into a **realistic outlet e-commerce simulation**.

Every important interaction should work.

The user should be able to:

- browse products
- search products
- filter products
- sort products
- open product details
- select size/color/variant where applicable
- see product availability
- add products to cart
- change quantities
- remove products
- save products to wishlist
- continue shopping
- see cart totals
- apply discount/promo codes
- proceed through checkout
- enter customer information
- select delivery method
- select payment method
- see order summary
- place an order
- receive order confirmation
- see order history
- view order details
- manage their profile
- return to the store and continue shopping

The application should behave like a real e-commerce product rather than a collection of static screens.

---

# 3. IMPORTANT: DO NOT MAKE IT LOOK "AI-GENERATED"

The visual design must NOT look like a generic AI-generated SaaS template.

Avoid:

- excessive gradients
- huge rounded cards everywhere
- excessive glassmorphism
- random decorative elements
- unnecessary animations
- generic purple/blue AI aesthetics
- oversized typography
- meaningless dashboard-style layouts
- excessive whitespace
- fake-looking stock UI patterns

The design should look like it was created by a **senior e-commerce product designer**.

Use a strong visual hierarchy, intentional spacing, refined typography, realistic product photography, subtle interactions and excellent information architecture.

The store should feel commercially credible.

Think:

**premium outlet + modern fashion commerce + conversion-focused UX**

rather than:

**AI-generated startup landing page**.

---

# 4. REAL PRODUCTS AND REAL PRODUCT PHOTOS

Populate the store with a realistic product catalog.

Do NOT leave placeholder products such as:

- Product 1
- Product 2
- Test Product
- Lorem Ipsum
- Generic placeholder images

Create a meaningful catalog with realistic:

- product names
- brands
- categories
- descriptions
- prices
- original prices
- outlet prices
- discounts
- sizes
- colors
- availability
- SKU
- product images
- product ratings
- review counts
- product tags

Use **real publicly available product photography where legally appropriate**, preferably from official brand/product sources or other sources that permit reuse.

Do not use random unrelated images.

Product photography should match the actual product.

If external image URLs are used, make sure they are reliable and appropriate for production/demo purposes.

Where practical, download/import assets into the project's storage rather than relying on fragile third-party URLs.

---

# 5. PRODUCT CATALOG

Create a realistic outlet inventory.

Include several categories such as:

- Clothing
- Shoes
- Accessories
- Bags
- Sportswear
- Outerwear
- Premium / Designer
- Seasonal items

Create enough products to make the store feel real.

Aim for approximately:

**40–100 products**

with realistic variations.

Products should have different discount levels.

For example:

- 15% OFF
- 25% OFF
- 35% OFF
- 50% OFF
- 60% OFF
- Limited stock
- Last sizes
- Outlet exclusive

Do not make every product look artificially discounted.

---

# 6. PRODUCT DETAIL PAGE

Build a convincing product page.

Include:

- large product gallery
- multiple product images
- image zoom
- product name
- brand
- rating
- review count
- original price
- current outlet price
- discount percentage
- available sizes
- available colors
- size guide
- stock status
- quantity selector
- Add to Cart
- Buy Now
- Wishlist
- shipping information
- returns information
- product description
- materials
- product specifications
- related products
- recently viewed products
- recommended products

The product page should answer the user's questions **before they have to ask them**.

---

# 7. APPLY BUYER PSYCHOLOGY / CRO

This is extremely important.

Do NOT just implement normal e-commerce functionality.

Design the experience based on **ethical buyer psychology and conversion-rate optimization**.

Analyze what makes people hesitate before buying and reduce those points of friction.

Important psychological principles to implement:

### Trust

Users need to feel:

- this store is legitimate
- the product is authentic
- the price is transparent
- payment is secure
- delivery is predictable
- returns are possible
- customer support exists

Implement:

- clear delivery information
- clear return policy
- secure checkout indicators
- transparent pricing
- authentic-looking product information
- customer reviews
- FAQ
- contact/support access
- clear business information

---

### Reduce decision anxiety

Add useful information such as:

- size guide
- fit information
- material information
- delivery estimate
- return window
- availability
- product dimensions where relevant
- product reviews

The goal is to eliminate uncertainty.

---

### Scarcity — but ethically

Use real inventory-based messaging such as:

- "Only 2 left"
- "Low stock"
- "Last available size"
- "Limited outlet stock"

ONLY when supported by actual inventory data.

Never create fake countdown timers or fake scarcity.

---

### Social proof

Implement realistic review functionality.

Products should have:

- star ratings
- review counts
- written reviews
- verified-purchase indicators where appropriate

Do not make every product have perfect 5-star ratings.

The distribution should feel natural.

---

### Anchoring

Clearly communicate outlet value:

~~Original price~~

**Outlet price**

**Save $XX / XX%**

The discount should be visually obvious without making the interface look cheap.

---

### Choice architecture

Avoid overwhelming users with too many choices.

Make:

- recommended products
- best sellers
- popular products
- new arrivals
- outlet deals

easy to discover.

---

### Loss aversion

Use useful messaging such as:

- "Your size is almost gone"
- "This item is currently low in stock"
- "Your cart is reserved for a limited time"

Only implement claims that are actually backed by application logic.

---

### Progress and commitment

Checkout should clearly communicate progress:

**Cart → Information → Delivery → Payment → Confirmation**

The user should always understand where they are.

---

# 8. PERSONALIZATION

Implement useful personalization features.

Examples:

### Recently Viewed

Store recently viewed products.

### Recommended For You

Generate recommendations based on:

- viewed products
- categories
- brands
- price range
- wishlist
- cart contents

For the demo, a deterministic recommendation algorithm is completely acceptable.

Do not over-engineer AI recommendations unless necessary.

---

# 9. SMART CART

The cart should be more than a list of products.

Include:

- product image
- product name
- size/color
- price
- quantity
- subtotal
- discount
- estimated delivery
- remove
- save for later

Add a useful free-shipping progress indicator.

Example:

"Add $25 more to unlock free shipping."

This should be calculated dynamically.

Also show:

- subtotal
- discount
- shipping
- estimated tax if applicable
- final total

---

# 10. CHECKOUT

Create a realistic multi-step checkout.

Steps:

1. Customer information
2. Delivery
3. Payment
4. Order review
5. Confirmation

Implement validation.

Handle:

- invalid email
- missing address
- invalid phone
- unavailable product
- insufficient stock
- invalid promo code
- expired promo code

Do not allow impossible orders.

---

# 11. PAYMENT

This is a simulation unless a real payment provider is already configured.

Create a realistic payment abstraction.

Structure the application so that a real payment provider can later be connected without rewriting the checkout.

Use a mock payment flow for now.

For example:

Payment method:

- Card
- Cash on Delivery
- Other configured methods

The mock payment should behave realistically:

- loading state
- validation
- success
- failure
- order creation

Never store raw card numbers.

---

# 12. DATABASE

Move the application away from fake in-memory demo data.

Use a proper persistent database connected to Cloudflare infrastructure.

Prefer an architecture appropriate for Cloudflare Pages/Workers.

Evaluate whether the project should use:

- Cloudflare D1
- KV
- R2
- Durable Objects

Use each technology only where it makes architectural sense.

Recommended approach:

### D1

Use D1 for structured relational data:

- users
- products
- product variants
- categories
- inventory
- carts
- orders
- order items
- reviews
- wishlists
- promo codes

### R2

Use R2 for:

- product images
- uploaded assets
- other persistent media

### KV

Use KV only for appropriate cache/session/configuration use cases.

Do not put relational e-commerce data into KV just because it is easy.

---

# 13. CLOUDFLARE INTEGRATION

The application must be properly integrated with Cloudflare.

Configure the necessary:

- Cloudflare Pages/Workers
- D1 database
- R2 bucket
- environment variables
- bindings
- migrations
- API routes
- production configuration

Create proper configuration files.

Do not hardcode secrets.

Use environment variables for:

- database configuration
- authentication secrets
- payment configuration
- API keys
- other sensitive values

Create clear development and production configuration.

---

# 14. DATABASE SCHEMA

Design a proper schema.

At minimum consider:

### users

- id
- email
- name
- phone
- password/auth reference
- created_at

### products

- id
- brand
- name
- slug
- description
- category_id
- original_price
- sale_price
- currency
- sku
- rating
- review_count
- created_at

### product_variants

- id
- product_id
- size
- color
- sku
- stock

### product_images

- id
- product_id
- url
- alt
- sort_order

### categories

- id
- name
- slug

### carts

### cart_items

### wishlists

### orders

### order_items

### reviews

### promo_codes

Adjust the schema according to the existing application architecture.

Add indexes where appropriate.

---

# 15. SEARCH

Implement real product search.

Search should support:

- product name
- brand
- category
- SKU
- relevant keywords

Include:

- autocomplete
- search suggestions
- empty search state
- no-results recommendations

Make search fast.

---

# 16. FILTERING AND SORTING

Implement meaningful filters.

Examples:

- Category
- Brand
- Price
- Discount
- Size
- Color
- Availability
- Rating

Sorting:

- Recommended
- Newest
- Price low → high
- Price high → low
- Biggest discount
- Best rated

Filters should work together.

URL state should preferably reflect filter state so pages can be shared/bookmarked.

---

# 17. MOBILE EXPERIENCE

The website must be excellent on:

- desktop
- tablet
- mobile

Do not simply shrink the desktop design.

Design mobile interactions intentionally.

Pay special attention to:

- sticky Add to Cart
- mobile navigation
- filter drawer
- search
- product gallery
- checkout forms
- cart
- bottom navigation if appropriate

---

# 18. MICROINTERACTIONS

Use subtle animations where they improve usability.

Examples:

- Add to cart feedback
- Wishlist animation
- Image transitions
- Filter transitions
- Cart drawer
- Loading skeletons
- Button loading states
- Toast notifications
- Checkout transitions

Do NOT over-animate the website.

Performance comes first.

---

# 19. EMPTY / ERROR / LOADING STATES

Every major feature must have proper states.

Implement:

- loading
- skeleton
- empty
- error
- success
- offline/network failure where appropriate

Examples:

Empty cart:

"Your cart is empty"

with useful recommended products.

No search results:

"We couldn't find what you're looking for"

with category suggestions.

---

# 20. ADMIN / INVENTORY SIMULATION

If appropriate for the existing architecture, create a simple admin area.

Admin should be able to:

- create products
- edit products
- update inventory
- manage prices
- manage discounts
- manage categories
- view orders
- update order status
- manage promo codes

This does not need to be enterprise-level.

It should simply prove that the storefront is backed by real persistent data.

---

# 21. ORDER SYSTEM

Orders should have realistic statuses:

- Pending
- Confirmed
- Processing
- Shipped
- Delivered
- Cancelled

Create order numbers.

Example:

OUT-2026-000123

Users should be able to see their orders and status.

---

# 22. PROMOTIONS

Implement a basic promo-code system.

Examples:

- WELCOME10
- OUTLET20
- SAVE30

Promo codes should have:

- percentage discount
- fixed discount
- minimum order amount
- expiration
- usage limits
- active/inactive state

Do not hardcode promotional logic directly into UI components.

---

# 23. SEO

Implement proper e-commerce SEO.

Include:

- title
- meta description
- canonical URLs
- product structured data
- Open Graph metadata
- semantic HTML
- proper headings
- product URLs/slugs
- sitemap where appropriate
- robots configuration

---

# 24. PERFORMANCE

The site should be fast.

Optimize:

- image loading
- image dimensions
- lazy loading
- caching
- database queries
- API calls
- bundle size
- unnecessary client-side rendering

Avoid loading huge images unnecessarily.

Use responsive image strategies where possible.

---

# 25. ACCESSIBILITY

Follow good accessibility practices.

Include:

- keyboard navigation
- focus states
- semantic HTML
- accessible buttons
- accessible forms
- alt text
- proper labels
- sufficient contrast
- screen-reader-friendly interactions

---

# 26. ANALYTICS / EVENT TRACKING

Create an event abstraction that can later connect to analytics.

Track useful e-commerce events:

- product_view
- search
- filter_used
- add_to_cart
- remove_from_cart
- wishlist_add
- checkout_started
- checkout_completed
- promo_applied
- purchase

Do not add invasive tracking.

Keep the architecture provider-agnostic.

---

# 27. SECURITY

Treat this as a real application.

Implement:

- server-side validation
- input sanitization
- authorization
- secure authentication
- protected admin routes
- no sensitive data in client code
- no secrets in repository
- proper database access controls
- safe API endpoints

Never trust client-provided prices.

The server/database must determine:

- product price
- stock
- discounts
- order totals

---

# 28. CODE QUALITY

Write production-quality code.

Avoid:

- giant components
- duplicated logic
- hardcoded product data in UI
- magic numbers
- fake API abstractions that do nothing
- unnecessary dependencies
- overengineering

Create clean boundaries between:

- UI
- business logic
- API
- database
- authentication
- product services
- checkout
- recommendation logic

Use reusable components.

---

# 29. DESIGN SYSTEM

Create a consistent design system.

Define:

- typography
- spacing
- buttons
- inputs
- badges
- cards
- product cards
- modal
- drawer
- toast
- navigation
- responsive breakpoints

The system should feel cohesive.

Product cards should prioritize:

1. Product image
2. Brand/name
3. Price
4. Original price
5. Discount
6. Rating
7. Availability

Do not overload cards with unnecessary information.

---

# 30. HOMEPAGE

Create a high-converting homepage.

Suggested structure:

### Header

- logo
- navigation
- search
- account
- wishlist
- cart

### Hero

Strong outlet proposition.

Example concept:

"Premium brands. Outlet prices."

But create copy appropriate for the actual store.

### Categories

Visual category navigation.

### Best Sellers

Products with strong social proof.

### Biggest Deals

Products with meaningful discounts.

### New Arrivals

Recently added products.

### Brand section

Important brands.

### Trust section

Delivery / returns / secure payment / support.

### Personalized section

"Picked for you"

### Newsletter / membership

Only if useful.

### Footer

- customer service
- delivery
- returns
- FAQ
- terms
- privacy
- contact
- social links

---

# 31. NAVIGATION

Create intuitive information architecture.

Desktop:

- logo
- categories
- search
- account
- wishlist
- cart

Mobile:

- compact header
- search
- cart
- mobile navigation
- filter controls

Navigation should make discovering products effortless.

---

# 32. UX PRINCIPLE

At every stage ask:

> "What is stopping the customer from buying right now?"

Then remove that friction.

Examples:

If the user is looking at a product:
→ answer sizing questions.

If the user is hesitating:
→ show reviews, delivery and returns.

If the user has added something to cart:
→ make checkout extremely easy.

If the user abandons cart:
→ preserve cart state.

If the user searches for something:
→ provide useful suggestions.

If the user cannot find a product:
→ recommend alternatives.

---

# 33. REALISTIC DATA

The website should feel populated by a real business.

Avoid unrealistic patterns like:

- every product having 50 reviews
- every product having 5.0 rating
- every product being 70% off
- every product having unlimited stock
- every product having identical descriptions
- fake-looking names

Create believable variation.

---

# 34. TESTING

After implementation:

Test the complete customer journey:

1. Open homepage
2. Browse category
3. Search product
4. Filter products
5. Open product
6. Select variant
7. Add to wishlist
8. Add to cart
9. Modify quantity
10. Apply promo code
11. Checkout
12. Enter customer information
13. Select delivery
14. Select payment
15. Place order
16. See confirmation
17. Open order history
18. View order

Also test:

- mobile
- desktop
- empty cart
- invalid promo
- unavailable product
- insufficient stock
- invalid form
- failed payment
- database failure

Fix all obvious errors.

---

# 35. IMPORTANT IMPLEMENTATION RULE

Do not stop after making the UI look good.

The final result must have:

**REAL UI + REAL STATE + REAL DATABASE + REAL API LOGIC + REAL PRODUCT DATA + REAL CART + REAL CHECKOUT SIMULATION + REAL ORDER FLOW**

The user should be able to interact with the application as if it were a real e-commerce website.

---

# 36. CLOUDFLARE DEPLOYMENT

After implementation:

1. Verify Cloudflare configuration.
2. Create required D1 databases.
3. Create required R2 buckets.
4. Configure bindings.
5. Create migrations.
6. Seed the database with realistic products.
7. Upload product images.
8. Configure environment variables.
9. Build the application.
10. Run production build locally.
11. Fix build errors.
12. Verify all routes.
13. Verify API endpoints.
14. Verify database operations.
15. Verify image loading.
16. Verify checkout flow.
17. Verify deployment configuration.

Do not leave infrastructure as pseudo-code.

---

# 37. FINAL QUALITY BAR

Before considering the task finished, ask yourself:

### Would a real customer believe this is a functioning outlet store?

### Can the customer complete the entire purchase journey?

### Does the product catalog feel real?

### Do the images match the products?

### Does the site build trust?

### Does the UX reduce purchase anxiety?

### Is the checkout frictionless?

### Does the application persist data?

### Does Cloudflare actually host the required infrastructure?

### Does the site look like it was built by experienced professionals rather than generated by AI?

If the answer to any of these is "no", continue improving.

---

# 38. WORKING METHOD

Work iteratively.

First:

**AUDIT → ARCHITECTURE → DATABASE → PRODUCT DATA → CORE E-COMMERCE → UX/CRO → VISUAL POLISH → TESTING → CLOUDFLARE DEPLOYMENT**

Do not rewrite everything unnecessarily.

Reuse existing code when it is good.

Replace demo functionality when it prevents realistic behavior.

After each major implementation step, test the application.

Do not claim something is implemented unless it actually works.

If you encounter a technical limitation, solve it using the existing project architecture whenever possible rather than simply removing the feature.

---

# FINAL DELIVERABLE

The final result should be a **fully interactive, realistic outlet e-commerce platform**, not merely a visually improved prototype.

It should contain:

- polished professional UI
- realistic product catalog
- real product photography
- product detail pages
- search
- filtering
- sorting
- wishlist
- cart
- promotions
- checkout
- mock payment flow
- orders
- user account
- reviews
- recommendations
- recently viewed products
- inventory
- admin/inventory management where appropriate
- persistent database
- Cloudflare D1/R2 integration
- secure architecture
- responsive design
- SEO
- accessibility
- performance optimization
- buyer-psychology-driven UX
- ethical CRO features

Most importantly:

**Make it feel like a real commercial e-commerce product that could actually be launched.**

# CRITICAL REQUIREMENT — FULL E-COMMERCE SIMULATION

This website is a **fully simulated e-commerce environment for QA testers and product testing**.

It must behave as closely as possible to a real production e-commerce platform, but **NO REAL-WORLD TRANSACTION OR EXTERNAL BUSINESS OPERATION MUST EVER TAKE PLACE**.

The goal is to simulate the complete lifecycle of an e-commerce business so testers can realistically test every possible user journey.

Think of this as:

**"A production-like e-commerce sandbox where everything is real from the application's perspective, but nothing has real-world financial or operational consequences."**

---

# 1. EVERYTHING MUST BE SIMULATED

All business operations must happen inside the application's simulated environment.

The following must be fully simulated:

- user registration
- authentication
- login/logout
- password recovery
- product browsing
- product search
- filtering
- sorting
- product variants
- inventory
- stock changes
- wishlist
- cart
- coupons
- discounts
- checkout
- payment processing
- payment success
- payment failure
- delivery selection
- shipping calculation
- order creation
- order confirmation
- order cancellation
- order processing
- shipment
- delivery
- returns
- refunds
- customer notifications
- reviews
- customer support interactions
- promotional campaigns
- inventory changes
- admin operations

The tester should be able to experience the complete lifecycle without any real-world action occurring.

---

# 2. NO REAL MONEY MUST EVER BE CHARGED

This is an absolute requirement.

**NO REAL PAYMENT MUST EVER BE PROCESSED.**

Do NOT connect the application to a live payment processor.

Do NOT charge:

- real credit/debit cards
- real bank accounts
- real wallets
- real payment services

Instead, create a **fully simulated payment gateway**.

The checkout should LOOK and BEHAVE like a real payment system from the tester's perspective.

However, every transaction remains inside the sandbox.

---

# 3. SIMULATED PAYMENT GATEWAY

Create an internal payment simulation service.

For example:

`/api/simulation/payment`

It should simulate:

### Successful payment

Tester enters valid test information.

The system:

1. validates the payment form
2. shows processing state
3. simulates network/payment-provider delay
4. generates a simulated transaction ID
5. marks payment as successful
6. creates the order
7. reserves inventory
8. displays confirmation

Example:

`SIM-TXN-2026-8F42A1`

This transaction ID must exist only inside the simulation database.

---

### Failed payment

Allow testers to intentionally simulate:

- insufficient funds
- declined card
- expired card
- invalid card
- payment timeout
- payment provider unavailable
- network error
- 3DS/authentication failure

The UI should behave exactly as a real checkout would behave.

For example:

**Payment declined**

"Your payment could not be completed. Please check your payment details or try another payment method."

The tester can then retry.

---

# 4. TEST PAYMENT DATA

Provide clearly marked test payment methods.

For example:

**Test Card — Successful**

`4242 4242 4242 4242`

**Test Card — Declined**

`4000 0000 0000 0002`

Use obviously fictional/test-only data.

Never encourage testers to enter real financial information.

The application should clearly indicate that the environment is a **TEST / SANDBOX environment**.

---

# 5. SIMULATED ORDERS

Orders must behave like real orders.

When a tester completes checkout:

1. Create a real database order record.
2. Generate an order number.
3. Create order items.
4. Calculate totals.
5. Apply discounts.
6. Reserve/decrease simulated inventory.
7. Create a simulated payment transaction.
8. Create a simulated delivery record.
9. Show order confirmation.
10. Add the order to the user's order history.

Example:

`OUT-2026-000184`

The order should then move through realistic states.

---

# 6. SIMULATED ORDER LIFECYCLE

Implement a realistic order state machine.

Example:

**Pending Payment**

↓

**Payment Confirmed**

↓

**Order Confirmed**

↓

**Processing**

↓

**Packed**

↓

**Shipped**

↓

**In Transit**

↓

**Out for Delivery**

↓

**Delivered**

The system should allow testers/admins to simulate transitions.

Each transition should have:

- timestamp
- status
- optional note
- simulated event

The customer should be able to see the order timeline.

---

# 7. SIMULATED DELIVERY

No real delivery should ever be created.

Instead, simulate:

- shipping method
- shipping cost
- estimated delivery date
- tracking number
- shipment status
- delivery events

Example:

`SIM-GEO-482193`

Tracking timeline:

**Order confirmed**

→ **Package prepared**

→ **Handed to simulated carrier**

→ **In transit**

→ **Arrived at destination**

→ **Out for delivery**

→ **Delivered**

The tester should be able to experience the same UI they would see with a real shipment.

---

# 8. SIMULATED RETURNS

Implement a complete return workflow.

Tester should be able to:

1. Open an order.
2. Select an eligible product.
3. Select a return reason.
4. Submit a return request.
5. See return status.
6. Simulate return approval.
7. Simulate returned item received.
8. Simulate refund.

Possible states:

- Return Requested
- Under Review
- Approved
- Return in Transit
- Received
- Refund Processing
- Refunded
- Rejected

No physical item actually moves anywhere.

No real refund occurs.

---

# 9. SIMULATED REFUNDS

Refunds must also remain entirely inside the sandbox.

When a refund is triggered:

- create simulated refund record
- generate simulated refund ID
- update order status
- update payment status
- show refund timeline

Example:

`SIM-REF-2026-38192`

The UI should behave like a real refund system.

---

# 10. SIMULATED INVENTORY

Inventory must be persistent and dynamic.

For example:

Product:

**Nike Air Max 270**

Size 42:

`7 available`

If a tester buys one:

`6 available`

If the order is cancelled:

`7 available`

If the order is returned:

the inventory can be restored depending on the simulated business rules.

This allows testers to test:

- out-of-stock
- low stock
- race conditions
- cart inventory
- cancelled orders
- returned products
- stock restoration

---

# 11. SIMULATED PROMOTIONS

Promo codes should work exactly like real promotional systems.

Support:

- percentage discount
- fixed discount
- minimum purchase
- expiration
- usage limit
- per-user limit
- product-specific promotions
- category promotions
- first-order discount

All data should persist in the simulation database.

---

# 12. SIMULATED CUSTOMER NOTIFICATIONS

Create an internal notification system.

Simulate notifications for:

- order confirmation
- payment confirmation
- payment failure
- shipment
- delivery
- cancellation
- return approval
- refund
- promotional campaigns

Notifications can appear through:

- in-app notification center
- toast notifications
- simulated email inbox

If an email system is implemented, emails must be stored inside the application's simulated environment.

**Do not send real emails unless explicitly configured as a separate test service.**

---

# 13. SIMULATED EMAIL INBOX

For QA purposes, create an optional internal test mailbox.

Example:

**Tester's Inbox**

The system can generate simulated emails:

- Welcome to Outlet
- Order Confirmation
- Payment Confirmation
- Shipping Confirmation
- Delivery Confirmation
- Return Confirmation
- Refund Confirmation

Testers should be able to open these emails inside the application.

This allows QA testers to test email-related flows without sending anything externally.

---

# 14. ADMIN / QA CONTROL CENTER

Create a dedicated **Simulation Control Center** for testers/admins.

This is extremely important.

The QA tester should be able to manipulate the simulated environment.

For example:

### Payment simulation

- Successful
- Declined
- Timeout
- Provider unavailable
- Authentication failure

### Delivery simulation

- Processing
- Shipped
- In transit
- Out for delivery
- Delivered
- Delivery failed

### Inventory

- Increase stock
- Decrease stock
- Set product out of stock

### Order

- Confirm
- Cancel
- Process
- Ship
- Deliver
- Return
- Refund

### User

- Create test customer
- Reset account
- Clear cart
- Clear wishlist
- Reset test data

This control center exists specifically so QA testers can reproduce different scenarios.

---

# 15. SCENARIO / TEST MODE

Create predefined test scenarios.

Examples:

### Scenario 1 — Successful purchase

Browse → Product → Cart → Checkout → Successful payment → Order → Shipment → Delivery

### Scenario 2 — Failed payment

Checkout → Payment declined → Retry → Successful payment

### Scenario 3 — Out of stock

Product → Add to cart → Inventory becomes unavailable → Checkout detects unavailable item

### Scenario 4 — Cancellation

Purchase → Order confirmed → Cancel → Inventory restored

### Scenario 5 — Return

Delivered order → Return request → Approved → Returned → Refund

### Scenario 6 — Failed delivery

Order → Shipped → Delivery failed → Retry delivery

### Scenario 7 — Expired promotion

Apply expired promo → Validation error → Remove promo → Continue checkout

These scenarios should allow testers to quickly reproduce complex flows.

---

# 16. TIME SIMULATION

The simulation should not force testers to wait hours or days.

Create a simulated application clock/event system where appropriate.

For example:

A tester can press:

**"Advance Order"**

and the order moves:

Processing → Packed → Shipped → Delivered

Alternatively, the QA control center can provide:

- +1 hour
- +1 day
- +3 days
- +7 days

This allows testing time-dependent functionality immediately.

---

# 17. DATABASE = SIMULATION STATE

The database represents the entire simulated business.

Persist:

- users
- products
- variants
- inventory
- carts
- orders
- payments
- refunds
- shipments
- returns
- reviews
- promotions
- notifications
- simulated emails
- QA scenarios
- event history

Every action should update the relevant state.

Do not fake these operations purely in frontend state.

---

# 18. EVENT LOG

Create an internal event/audit system.

For every important action, record:

- event type
- user
- entity
- timestamp
- previous state
- new state
- metadata

Example:

`ORDER_STATUS_CHANGED`

`Processing → Shipped`

This will make the application much more useful for QA testing.

---

# 19. IMPORTANT SAFETY BOUNDARY

The entire application must remain isolated from real-world financial and operational systems.

There must be NO accidental:

- real payments
- real refunds
- real purchases
- real shipping orders
- real inventory operations
- real customer emails
- real SMS
- real financial transactions

Everything must remain inside the test environment.

Clearly mark the application:

**TEST / SANDBOX ENVIRONMENT**

---

# 20. THE GOAL

The goal is NOT to create a fake-looking demo.

The goal is to create a **high-fidelity production simulation**.

From the tester's perspective:

> "I should be able to test this exactly as if I were testing a real e-commerce platform."

From the infrastructure perspective:

> "Nothing leaves the sandbox and no real money or real-world operation is performed."

The application should therefore simulate:

**Customer → Product → Cart → Checkout → Payment → Order → Warehouse → Shipment → Delivery → Return → Refund**

with persistent state and realistic business logic.

Everything should be testable, repeatable and resettable.
