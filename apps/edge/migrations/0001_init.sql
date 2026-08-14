-- Outlet Marketplace — Cloudflare D1 (SQLite) schema.
--
-- A translation of packages/database/prisma/schema.prisma, not a re-import of
-- its PostgreSQL migrations: those use types D1 does not have. The mapping is
--
--   ENUM            -> TEXT + CHECK (…) IN (…)   — the value set stays in the
--                      database rather than living only in application code.
--   JSONB           -> TEXT + CHECK (json_valid) — SQLite's JSON1 functions
--                      read these, so json_extract() still works in queries.
--   TEXT[]          -> TEXT holding a JSON array, defaulting to '[]'.
--   TIMESTAMP(3)    -> TEXT holding ISO-8601 UTC ('2026-01-01T00:00:00.000Z').
--                      Lexicographic order equals chronological order for this
--                      format, so BETWEEN/ORDER BY/index range scans all work.
--   BOOLEAN         -> INTEGER 0/1, constrained so nothing else can be stored.
--
-- Money stays in integer minor units everywhere (4999 = €49.99). No column in
-- this schema is REAL.
--
-- Table and column names are identical to the PostgreSQL schema so the two
-- remain diff-able and the existing TypeScript types map without a rename
-- layer.

-- ---------------------------------------------------------------------------
-- Users, auth, RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE "users" (
  "id"                          TEXT PRIMARY KEY,
  "email"                       TEXT NOT NULL,
  "passwordHash"                TEXT NOT NULL,
  "firstName"                   TEXT NOT NULL,
  "lastName"                    TEXT NOT NULL,
  "status"                      TEXT NOT NULL DEFAULT 'ACTIVE'
                                  CHECK ("status" IN ('ACTIVE', 'DISABLED')),
  "disabledReason"              TEXT,
  "isEmailVerified"             INTEGER NOT NULL DEFAULT 0 CHECK ("isEmailVerified" IN (0, 1)),
  "emailVerifiedAt"             TEXT,
  "emailVerificationTokenHash"  TEXT,
  "emailVerificationExpiresAt"  TEXT,
  "passwordResetTokenHash"      TEXT,
  "passwordResetExpiresAt"      TEXT,
  "failedLoginAttempts"         INTEGER NOT NULL DEFAULT 0 CHECK ("failedLoginAttempts" >= 0),
  "lockedUntil"                 TEXT,
  "newsletterOptIn"             INTEGER NOT NULL DEFAULT 0 CHECK ("newsletterOptIn" IN (0, 1)),
  "notifyOrderUpdates"          INTEGER NOT NULL DEFAULT 1 CHECK ("notifyOrderUpdates" IN (0, 1)),
  "notifyCampaigns"             INTEGER NOT NULL DEFAULT 1 CHECK ("notifyCampaigns" IN (0, 1)),
  "createdAt"                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX "users_status_idx" ON "users" ("status");

CREATE TABLE "user_sessions" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "createdAt"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "lastUsedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "expiresAt"  TEXT NOT NULL,
  "revokedAt"  TEXT,
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions" ("tokenHash");
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions" ("userId");
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions" ("expiresAt");

CREATE TABLE "addresses" (
  "id"                TEXT PRIMARY KEY,
  "userId"            TEXT NOT NULL,
  "type"              TEXT NOT NULL DEFAULT 'BOTH'
                        CHECK ("type" IN ('SHIPPING', 'BILLING', 'BOTH')),
  "firstName"         TEXT NOT NULL,
  "lastName"          TEXT NOT NULL,
  "line1"             TEXT NOT NULL,
  "line2"             TEXT,
  "city"              TEXT NOT NULL,
  "region"            TEXT,
  "postalCode"        TEXT NOT NULL,
  "countryCode"       TEXT NOT NULL,
  "phone"             TEXT,
  "isDefaultShipping" INTEGER NOT NULL DEFAULT 0 CHECK ("isDefaultShipping" IN (0, 1)),
  "isDefaultBilling"  INTEGER NOT NULL DEFAULT 0 CHECK ("isDefaultBilling" IN (0, 1)),
  "createdAt"         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE INDEX "addresses_userId_idx" ON "addresses" ("userId");

CREATE TABLE "roles" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isSystem"    INTEGER NOT NULL DEFAULT 0 CHECK ("isSystem" IN (0, 1))
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles" ("name");

CREATE TABLE "permissions" (
  "id"          TEXT PRIMARY KEY,
  "key"         TEXT NOT NULL,
  "description" TEXT
);
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions" ("key");

CREATE TABLE "role_permissions" (
  "roleId"       TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  PRIMARY KEY ("roleId", "permissionId"),
  FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("permissionId") REFERENCES "permissions" ("id") ON DELETE CASCADE
);

CREATE TABLE "user_roles" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  PRIMARY KEY ("userId", "roleId"),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE
);

CREATE TABLE "customer_support_notes" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "authorId"  TEXT,
  "note"      TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE SET NULL
);
CREATE INDEX "customer_support_notes_userId_idx" ON "customer_support_notes" ("userId");

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE "brands" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "description" TEXT,
  "logoUrl"     TEXT,
  "isFeatured"  INTEGER NOT NULL DEFAULT 0 CHECK ("isFeatured" IN (0, 1)),
  "isActive"    INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0, 1)),
  "createdAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "brands_slug_key" ON "brands" ("slug");

-- Three levels: department (Women) -> category (Shoes) -> subcategory (Heels).
-- `isActive` is the administrator's switch alone; a category holding no
-- available product is *empty*, which the storefront hides on its own and
-- un-hides when stock returns. Conflating the two would mean a sold-out
-- category could never come back.
CREATE TABLE "categories" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "parentId"       TEXT,
  "description"    TEXT,
  "position"       INTEGER NOT NULL DEFAULT 0,
  "isActive"       INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0, 1)),
  "pathSegment"    TEXT NOT NULL DEFAULT '',
  "targetGroup"    TEXT NOT NULL DEFAULT 'UNISEX'
                     CHECK ("targetGroup" IN ('MEN', 'WOMEN', 'KIDS', 'UNISEX')),
  "sizeChartGroup" TEXT,
  "createdAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("parentId") REFERENCES "categories" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" ("slug");
CREATE INDEX "categories_parentId_idx" ON "categories" ("parentId");
CREATE INDEX "categories_targetGroup_idx" ON "categories" ("targetGroup");

CREATE TABLE "products" (
  "id"                 TEXT PRIMARY KEY,
  "name"               TEXT NOT NULL,
  "slug"               TEXT NOT NULL,
  "brandId"            TEXT NOT NULL,
  "categoryId"         TEXT,
  "shortDescription"   TEXT,
  "description"        TEXT,
  "targetGroup"        TEXT NOT NULL DEFAULT 'UNISEX'
                         CHECK ("targetGroup" IN ('MEN', 'WOMEN', 'KIDS', 'UNISEX')),
  "materials"          TEXT,
  "careInstructions"   TEXT,
  "countryOfOrigin"    TEXT,
  "originalPriceMinor" INTEGER NOT NULL CHECK ("originalPriceMinor" >= 0),
  "outletPriceMinor"   INTEGER NOT NULL CHECK ("outletPriceMinor" >= 0),
  "currencyCode"       TEXT NOT NULL DEFAULT 'EUR',
  "taxClass"           TEXT NOT NULL DEFAULT 'STANDARD'
                         CHECK ("taxClass" IN ('STANDARD', 'REDUCED', 'ZERO')),
  "status"             TEXT NOT NULL DEFAULT 'DRAFT'
                         CHECK ("status" IN ('DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED')),
  "publishedFrom"      TEXT,
  "publishedUntil"     TEXT,
  "seoTitle"           TEXT,
  "seoDescription"     TEXT,
  "searchKeywords"     TEXT,
  "archivedAt"         TEXT,
  "version"            INTEGER NOT NULL DEFAULT 0,
  -- Denormalised review aggregates, recomputed whenever a review is written,
  -- so listing and "best rated" sorting stay single-query.
  "ratingSum"          INTEGER NOT NULL DEFAULT 0 CHECK ("ratingSum" >= 0),
  "reviewCount"        INTEGER NOT NULL DEFAULT 0 CHECK ("reviewCount" >= 0),
  "createdAt"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("brandId") REFERENCES "brands" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "products_slug_key" ON "products" ("slug");
CREATE INDEX "products_brandId_idx" ON "products" ("brandId");
CREATE INDEX "products_categoryId_idx" ON "products" ("categoryId");
CREATE INDEX "products_status_idx" ON "products" ("status");
CREATE INDEX "products_targetGroup_idx" ON "products" ("targetGroup");
CREATE INDEX "products_outletPriceMinor_idx" ON "products" ("outletPriceMinor");
CREATE INDEX "products_createdAt_idx" ON "products" ("createdAt");
CREATE INDEX "products_reviewCount_idx" ON "products" ("reviewCount");
-- Listing pages filter on status and sort within it; a composite index keeps
-- the common "active products, newest first" scan off a temp b-tree.
CREATE INDEX "products_status_createdAt_idx" ON "products" ("status", "createdAt");

CREATE TABLE "product_variants" (
  "id"                 TEXT PRIMARY KEY,
  "productId"          TEXT NOT NULL,
  "sku"                TEXT NOT NULL,
  "barcode"            TEXT,
  "size"               TEXT,
  "color"              TEXT,
  "attributes"         TEXT CHECK ("attributes" IS NULL OR json_valid("attributes")),
  "priceOverrideMinor" INTEGER CHECK ("priceOverrideMinor" IS NULL OR "priceOverrideMinor" >= 0),
  "weightGrams"        INTEGER,
  "dimensions"         TEXT,
  "isEnabled"          INTEGER NOT NULL DEFAULT 1 CHECK ("isEnabled" IN (0, 1)),
  "position"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants" ("sku");
CREATE INDEX "product_variants_productId_idx" ON "product_variants" ("productId");
CREATE INDEX "product_variants_size_idx" ON "product_variants" ("size");
CREATE INDEX "product_variants_color_idx" ON "product_variants" ("color");

CREATE TABLE "product_images" (
  "id"        TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "url"       TEXT NOT NULL,
  "objectKey" TEXT,
  "altText"   TEXT,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE SET NULL
);
CREATE INDEX "product_images_productId_idx" ON "product_images" ("productId");

CREATE TABLE "product_attributes" (
  "id"   TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL
);
CREATE UNIQUE INDEX "product_attributes_slug_key" ON "product_attributes" ("slug");

CREATE TABLE "product_attribute_values" (
  "id"          TEXT PRIMARY KEY,
  "attributeId" TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "value"       TEXT NOT NULL,
  FOREIGN KEY ("attributeId") REFERENCES "product_attributes" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "product_attribute_values_attributeId_productId_value_key"
  ON "product_attribute_values" ("attributeId", "productId", "value");
CREATE INDEX "product_attribute_values_productId_idx" ON "product_attribute_values" ("productId");

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE "campaigns" (
  "id"               TEXT PRIMARY KEY,
  "title"            TEXT NOT NULL,
  "slug"             TEXT NOT NULL,
  "shortDescription" TEXT,
  "description"      TEXT,
  "coverImageUrl"    TEXT,
  "startsAt"         TEXT NOT NULL,
  "endsAt"           TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'DRAFT'
                       CHECK ("status" IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED')),
  "position"         INTEGER NOT NULL DEFAULT 0,
  "isVisible"        INTEGER NOT NULL DEFAULT 1 CHECK ("isVisible" IN (0, 1)),
  "seoTitle"         TEXT,
  "seoDescription"   TEXT,
  "archivedAt"       TEXT,
  "createdAt"        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT "campaign_window_ordered" CHECK ("endsAt" > "startsAt")
);
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns" ("slug");
CREATE INDEX "campaigns_status_idx" ON "campaigns" ("status");
CREATE INDEX "campaigns_startsAt_endsAt_idx" ON "campaigns" ("startsAt", "endsAt");

CREATE TABLE "campaign_products" (
  "id"                  TEXT PRIMARY KEY,
  "campaignId"          TEXT NOT NULL,
  "productId"           TEXT NOT NULL,
  "campaignPriceMinor"  INTEGER CHECK ("campaignPriceMinor" IS NULL OR "campaignPriceMinor" >= 0),
  "maxQuantityPerOrder" INTEGER CHECK ("maxQuantityPerOrder" IS NULL OR "maxQuantityPerOrder" > 0),
  "quantityLimit"       INTEGER CHECK ("quantityLimit" IS NULL OR "quantityLimit" >= 0),
  "soldQuantity"        INTEGER NOT NULL DEFAULT 0 CHECK ("soldQuantity" >= 0),
  "position"            INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "campaign_products_campaignId_productId_key"
  ON "campaign_products" ("campaignId", "productId");
CREATE INDEX "campaign_products_productId_idx" ON "campaign_products" ("productId");

-- ---------------------------------------------------------------------------
-- Inventory — the database is the final authority on stock
-- ---------------------------------------------------------------------------
--
--   onHandQuantity   physically sellable units in the warehouse
--                    (sold/shipped and damaged units already removed)
--   reservedQuantity units held by ACTIVE/CHECKOUT/PAYMENT reservations
--   available        onHandQuantity - reservedQuantity
--   soldQuantity     lifetime units sold           (informational counter)
--   damagedQuantity  lifetime units marked damaged (informational counter)
--   returnedQuantity lifetime units returned       (informational counter)

CREATE TABLE "inventory_balances" (
  "id"               TEXT PRIMARY KEY,
  "variantId"        TEXT NOT NULL,
  "onHandQuantity"   INTEGER NOT NULL DEFAULT 0,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "soldQuantity"     INTEGER NOT NULL DEFAULT 0,
  "damagedQuantity"  INTEGER NOT NULL DEFAULT 0,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "version"          INTEGER NOT NULL DEFAULT 0,
  "updatedAt"        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT "inventory_quantities_non_negative" CHECK (
    "onHandQuantity" >= 0 AND "reservedQuantity" >= 0 AND "soldQuantity" >= 0
    AND "damagedQuantity" >= 0 AND "returnedQuantity" >= 0
  ),
  CONSTRAINT "inventory_reserved_lte_on_hand" CHECK ("reservedQuantity" <= "onHandQuantity"),
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "inventory_balances_variantId_key" ON "inventory_balances" ("variantId");

CREATE TABLE "inventory_movements" (
  "id"              TEXT PRIMARY KEY,
  "variantId"       TEXT NOT NULL,
  "type"            TEXT NOT NULL CHECK ("type" IN (
                      'INITIAL', 'RESTOCK', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE',
                      'CORRECTION', 'DAMAGED', 'SALE', 'RETURN_RESTOCK', 'RELEASE')),
  "quantityChange"  INTEGER NOT NULL,
  "previousOnHand"  INTEGER NOT NULL,
  "newOnHand"       INTEGER NOT NULL,
  "reason"          TEXT,
  "actorUserId"     TEXT,
  "orderId"         TEXT,
  "returnRequestId" TEXT,
  "createdAt"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE CASCADE
);
CREATE INDEX "inventory_movements_variantId_idx" ON "inventory_movements" ("variantId");
CREATE INDEX "inventory_movements_createdAt_idx" ON "inventory_movements" ("createdAt");

-- ---------------------------------------------------------------------------
-- Discounts
-- ---------------------------------------------------------------------------

CREATE TABLE "coupons" (
  "id"                        TEXT PRIMARY KEY,
  "code"                      TEXT NOT NULL,
  "type"                      TEXT NOT NULL CHECK ("type" IN ('FIXED', 'PERCENTAGE')),
  "value"                     INTEGER NOT NULL CHECK ("value" >= 0),
  "minOrderMinor"             INTEGER CHECK ("minOrderMinor" IS NULL OR "minOrderMinor" >= 0),
  "maxDiscountMinor"          INTEGER CHECK ("maxDiscountMinor" IS NULL OR "maxDiscountMinor" >= 0),
  "startsAt"                  TEXT,
  "endsAt"                    TEXT,
  "maxRedemptions"            INTEGER CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" >= 0),
  "maxRedemptionsPerCustomer" INTEGER CHECK ("maxRedemptionsPerCustomer" IS NULL OR "maxRedemptionsPerCustomer" >= 0),
  "timesRedeemed"             INTEGER NOT NULL DEFAULT 0 CHECK ("timesRedeemed" >= 0),
  "firstOrderOnly"            INTEGER NOT NULL DEFAULT 0 CHECK ("firstOrderOnly" IN (0, 1)),
  -- Waives standard shipping rather than reducing the subtotal. A flag rather
  -- than a third coupon type so a code can do both at once.
  "freeShipping"              INTEGER NOT NULL DEFAULT 0 CHECK ("freeShipping" IN (0, 1)),
  "description"               TEXT,
  "isActive"                  INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0, 1)),
  -- Restriction id arrays. PostgreSQL used TEXT[]; here they are JSON arrays,
  -- read with json_each() when a restriction has to be applied in SQL.
  "brandIds"                  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid("brandIds")),
  "categoryIds"               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid("categoryIds")),
  "productIds"                TEXT NOT NULL DEFAULT '[]' CHECK (json_valid("productIds")),
  "campaignIds"               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid("campaignIds")),
  "createdAt"                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- A percentage coupon is expressed in whole percent, so anything above 100
  -- would hand money back rather than discount the order.
  CONSTRAINT "coupon_percentage_within_range" CHECK (
    "type" <> 'PERCENTAGE' OR "value" <= 100
  ),
  -- A coupon has to grant something. Zero value is only meaningful when the
  -- code exists to waive shipping.
  CONSTRAINT "coupon_grants_something" CHECK ("value" > 0 OR "freeShipping" = 1)
);
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons" ("code");

CREATE TABLE "promotions" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        TEXT NOT NULL,
  "value"       INTEGER NOT NULL,
  "startsAt"    TEXT,
  "endsAt"      TEXT,
  "isActive"    INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0, 1)),
  "createdAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Cart & wishlist
-- ---------------------------------------------------------------------------

CREATE TABLE "carts" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT,
  "anonymousToken" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK ("status" IN ('ACTIVE', 'CONVERTED', 'MERGED', 'ABANDONED')),
  "currencyCode"   TEXT NOT NULL DEFAULT 'EUR',
  "couponId"       TEXT,
  "createdAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("couponId") REFERENCES "coupons" ("id") ON DELETE SET NULL
);
-- NULLs are distinct in a SQLite unique index, exactly as in PostgreSQL, so
-- every signed-in cart can leave this column empty.
CREATE UNIQUE INDEX "carts_anonymousToken_key" ON "carts" ("anonymousToken");
CREATE INDEX "carts_userId_idx" ON "carts" ("userId");
CREATE INDEX "carts_status_idx" ON "carts" ("status");

CREATE TABLE "cart_items" (
  "id"             TEXT PRIMARY KEY,
  "cartId"         TEXT NOT NULL,
  "variantId"      TEXT NOT NULL,
  "campaignId"     TEXT,
  "quantity"       INTEGER NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL CHECK ("unitPriceMinor" >= 0),
  -- Parked by the customer: listed under the cart, excluded from totals, and
  -- holding no inventory reservation.
  "savedForLater"  INTEGER NOT NULL DEFAULT 0 CHECK ("savedForLater" IN (0, 1)),
  "createdAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT "cart_item_quantity_positive" CHECK ("quantity" > 0),
  FOREIGN KEY ("cartId") REFERENCES "carts" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "cart_items_cartId_variantId_key" ON "cart_items" ("cartId", "variantId");
CREATE INDEX "cart_items_variantId_idx" ON "cart_items" ("variantId");
CREATE INDEX "cart_items_cartId_savedForLater_idx" ON "cart_items" ("cartId", "savedForLater");

CREATE TABLE "wishlists" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "wishlists_userId_key" ON "wishlists" ("userId");

CREATE TABLE "wishlist_items" (
  "id"         TEXT PRIMARY KEY,
  "wishlistId" TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "variantId"  TEXT,
  "createdAt"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("wishlistId") REFERENCES "wishlists" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "wishlist_items_wishlistId_productId_key"
  ON "wishlist_items" ("wishlistId", "productId");

-- ---------------------------------------------------------------------------
-- Orders & payments
-- ---------------------------------------------------------------------------

CREATE TABLE "orders" (
  "id"                     TEXT PRIMARY KEY,
  "orderNumber"            TEXT NOT NULL,
  "userId"                 TEXT,
  "email"                  TEXT NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK ("status" IN (
                             'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED',
                             'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED',
                             'PARTIALLY_RETURNED', 'RETURNED')),
  "currencyCode"           TEXT NOT NULL DEFAULT 'EUR',
  "subtotalMinor"          INTEGER NOT NULL CHECK ("subtotalMinor" >= 0),
  "discountMinor"          INTEGER NOT NULL DEFAULT 0 CHECK ("discountMinor" >= 0),
  "shippingMinor"          INTEGER NOT NULL DEFAULT 0 CHECK ("shippingMinor" >= 0),
  "taxMinor"               INTEGER NOT NULL DEFAULT 0 CHECK ("taxMinor" >= 0),
  "totalMinor"             INTEGER NOT NULL CHECK ("totalMinor" >= 0),
  "couponId"               TEXT,
  "couponCode"             TEXT,
  "shippingAddress"        TEXT NOT NULL CHECK (json_valid("shippingAddress")),
  "billingAddress"         TEXT NOT NULL CHECK (json_valid("billingAddress")),
  "shippingMethod"         TEXT NOT NULL DEFAULT 'STANDARD'
                             CHECK ("shippingMethod" IN ('STANDARD', 'EXPRESS')),
  "customerNote"           TEXT,
  "internalNote"           TEXT,
  "checkoutIdempotencyKey" TEXT,
  "placedAt"               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "paidAt"                 TEXT,
  "cancelledAt"            TEXT,
  "cancelReason"           TEXT,
  "version"                INTEGER NOT NULL DEFAULT 0,
  "createdAt"              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- The server computes every component; this makes an inconsistent total
  -- unstorable rather than merely unlikely.
  --
  -- `taxMinor` is deliberately absent: prices in this shop are VAT-inclusive,
  -- so the tax is the portion of the total already inside it, not a line added
  -- on top. Adding it here would double-count and reject every real order.
  CONSTRAINT "order_total_is_consistent" CHECK (
    "totalMinor" = "subtotalMinor" - "discountMinor" + "shippingMinor"
  ),
  CONSTRAINT "order_tax_within_total" CHECK ("taxMinor" <= "totalMinor"),
  CONSTRAINT "order_discount_lte_subtotal" CHECK ("discountMinor" <= "subtotalMinor"),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("couponId") REFERENCES "coupons" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders" ("orderNumber");
CREATE UNIQUE INDEX "orders_checkoutIdempotencyKey_key" ON "orders" ("checkoutIdempotencyKey");
CREATE INDEX "orders_userId_idx" ON "orders" ("userId");
CREATE INDEX "orders_status_idx" ON "orders" ("status");
CREATE INDEX "orders_placedAt_idx" ON "orders" ("placedAt");
CREATE INDEX "orders_email_idx" ON "orders" ("email");
-- "my orders, newest first" is the single most common authenticated read.
CREATE INDEX "orders_userId_placedAt_idx" ON "orders" ("userId", "placedAt");

CREATE TABLE "order_items" (
  "id"                     TEXT PRIMARY KEY,
  "orderId"                TEXT NOT NULL,
  "variantId"              TEXT,
  "campaignId"             TEXT,
  -- Snapshot: a historical order must not change when the product does.
  "productSnapshot"        TEXT NOT NULL CHECK (json_valid("productSnapshot")),
  "sku"                    TEXT NOT NULL,
  "name"                   TEXT NOT NULL,
  "quantity"               INTEGER NOT NULL,
  "unitPriceMinor"         INTEGER NOT NULL CHECK ("unitPriceMinor" >= 0),
  "originalUnitPriceMinor" INTEGER NOT NULL CHECK ("originalUnitPriceMinor" >= 0),
  "discountMinor"          INTEGER NOT NULL DEFAULT 0 CHECK ("discountMinor" >= 0),
  "taxRateBps"             INTEGER NOT NULL DEFAULT 0 CHECK ("taxRateBps" >= 0),
  "taxMinor"               INTEGER NOT NULL DEFAULT 0 CHECK ("taxMinor" >= 0),
  "totalMinor"             INTEGER NOT NULL CHECK ("totalMinor" >= 0),
  "returnedQuantity"       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "order_item_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "order_item_returned_lte_quantity" CHECK (
    "returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity"
  ),
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE SET NULL
);
CREATE INDEX "order_items_orderId_idx" ON "order_items" ("orderId");
CREATE INDEX "order_items_variantId_idx" ON "order_items" ("variantId");

CREATE TABLE "order_status_history" (
  "id"          TEXT PRIMARY KEY,
  "orderId"     TEXT NOT NULL,
  "fromStatus"  TEXT CHECK ("fromStatus" IS NULL OR "fromStatus" IN (
                  'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED',
                  'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED',
                  'PARTIALLY_RETURNED', 'RETURNED')),
  "toStatus"    TEXT NOT NULL CHECK ("toStatus" IN (
                  'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED',
                  'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED',
                  'PARTIALLY_RETURNED', 'RETURNED')),
  "note"        TEXT,
  "actorUserId" TEXT,
  "createdAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE
);
CREATE INDEX "order_status_history_orderId_idx" ON "order_status_history" ("orderId");

CREATE TABLE "payments" (
  "id"                  TEXT PRIMARY KEY,
  "orderId"             TEXT NOT NULL,
  "provider"            TEXT NOT NULL,
  "providerPaymentId"   TEXT,
  "idempotencyKey"      TEXT,
  "status"              TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN (
                          'PENDING', 'PROCESSING', 'AUTHORIZED', 'PAID', 'FAILED',
                          'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  "amountMinor"         INTEGER NOT NULL CHECK ("amountMinor" >= 0),
  "refundedAmountMinor" INTEGER NOT NULL DEFAULT 0,
  "currencyCode"        TEXT NOT NULL DEFAULT 'EUR',
  "failureReason"       TEXT,
  "createdAt"           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT "payment_refund_lte_amount" CHECK (
    "refundedAmountMinor" >= 0 AND "refundedAmountMinor" <= "amountMinor"
  ),
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments" ("idempotencyKey");
CREATE INDEX "payments_orderId_idx" ON "payments" ("orderId");
CREATE INDEX "payments_status_idx" ON "payments" ("status");

CREATE TABLE "payment_events" (
  "id"              TEXT PRIMARY KEY,
  "paymentId"       TEXT,
  "provider"        TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "payload"         TEXT NOT NULL CHECK (json_valid("payload")),
  "processedAt"     TEXT,
  "createdAt"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("paymentId") REFERENCES "payments" ("id") ON DELETE SET NULL
);
-- Duplicate deliveries are detected by this constraint rather than by a read.
CREATE UNIQUE INDEX "payment_events_provider_providerEventId_key"
  ON "payment_events" ("provider", "providerEventId");
CREATE INDEX "payment_events_paymentId_idx" ON "payment_events" ("paymentId");

CREATE TABLE "shipments" (
  "id"             TEXT PRIMARY KEY,
  "orderId"        TEXT NOT NULL,
  "carrier"        TEXT,
  "trackingNumber" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK ("status" IN ('PENDING', 'SHIPPED', 'DELIVERED')),
  "shippedAt"      TEXT,
  "deliveredAt"    TEXT,
  "createdAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE
);
CREATE INDEX "shipments_orderId_idx" ON "shipments" ("orderId");

-- A carrier scan. Simulated end to end — no parcel exists and no carrier is
-- contacted; these rows are what the customer's tracking timeline renders.
CREATE TABLE "shipment_events" (
  "id"         TEXT PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "label"      TEXT NOT NULL,
  "location"   TEXT,
  "occurredAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("shipmentId") REFERENCES "shipments" ("id") ON DELETE CASCADE
);
CREATE INDEX "shipment_events_shipmentId_occurredAt_idx"
  ON "shipment_events" ("shipmentId", "occurredAt");

-- ---------------------------------------------------------------------------
-- Reservations — declared after orders because it points at them
-- ---------------------------------------------------------------------------

CREATE TABLE "inventory_reservations" (
  "id"              TEXT PRIMARY KEY,
  "cartId"          TEXT NOT NULL,
  "cartItemId"      TEXT,
  "userId"          TEXT,
  "sessionToken"    TEXT,
  "variantId"       TEXT NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN (
                      'ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING',
                      'CONVERTED', 'EXPIRED', 'CANCELLED')),
  "createdAt"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "expiresAt"       TEXT NOT NULL,
  "convertedAt"     TEXT,
  "cancelledReason" TEXT,
  "orderId"         TEXT,
  CONSTRAINT "reservation_quantity_positive" CHECK ("quantity" > 0),
  FOREIGN KEY ("cartId") REFERENCES "carts" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id"),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE SET NULL
);
CREATE INDEX "inventory_reservations_status_expiresAt_idx"
  ON "inventory_reservations" ("status", "expiresAt");
CREATE INDEX "inventory_reservations_cartId_idx" ON "inventory_reservations" ("cartId");
CREATE INDEX "inventory_reservations_variantId_idx" ON "inventory_reservations" ("variantId");
CREATE INDEX "inventory_reservations_orderId_idx" ON "inventory_reservations" ("orderId");

-- ---------------------------------------------------------------------------
-- Returns & refunds
-- ---------------------------------------------------------------------------

CREATE TABLE "return_requests" (
  "id"           TEXT PRIMARY KEY,
  "rmaNumber"    TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "userId"       TEXT,
  "status"       TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN (
                   'REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'COMPLETED', 'CANCELLED')),
  "reason"       TEXT NOT NULL,
  "customerNote" TEXT,
  "internalNote" TEXT,
  "createdAt"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "return_requests_rmaNumber_key" ON "return_requests" ("rmaNumber");
CREATE INDEX "return_requests_orderId_idx" ON "return_requests" ("orderId");
CREATE INDEX "return_requests_userId_idx" ON "return_requests" ("userId");
CREATE INDEX "return_requests_status_idx" ON "return_requests" ("status");

CREATE TABLE "return_items" (
  "id"                TEXT PRIMARY KEY,
  "returnRequestId"   TEXT NOT NULL,
  "orderItemId"       TEXT NOT NULL,
  "quantity"          INTEGER NOT NULL CHECK ("quantity" > 0),
  "receivedQuantity"  INTEGER NOT NULL DEFAULT 0 CHECK ("receivedQuantity" >= 0),
  "restockedQuantity" INTEGER NOT NULL DEFAULT 0 CHECK ("restockedQuantity" >= 0),
  "condition"         TEXT NOT NULL DEFAULT 'UNINSPECTED'
                        CHECK ("condition" IN ('UNINSPECTED', 'RESELLABLE', 'DAMAGED')),
  "reason"            TEXT,
  FOREIGN KEY ("returnRequestId") REFERENCES "return_requests" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("orderItemId") REFERENCES "order_items" ("id") ON DELETE CASCADE
);
CREATE INDEX "return_items_returnRequestId_idx" ON "return_items" ("returnRequestId");

CREATE TABLE "refunds" (
  "id"               TEXT PRIMARY KEY,
  "orderId"          TEXT NOT NULL,
  "paymentId"        TEXT NOT NULL,
  "returnRequestId"  TEXT,
  "amountMinor"      INTEGER NOT NULL CHECK ("amountMinor" > 0),
  "status"           TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK ("status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  "providerRefundId" TEXT,
  "reason"           TEXT,
  "createdByUserId"  TEXT,
  "createdAt"        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("paymentId") REFERENCES "payments" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("returnRequestId") REFERENCES "return_requests" ("id") ON DELETE SET NULL
);
CREATE INDEX "refunds_orderId_idx" ON "refunds" ("orderId");

-- ---------------------------------------------------------------------------
-- Misc platform tables
-- ---------------------------------------------------------------------------

CREATE TABLE "notifications" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "readAt"    TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE INDEX "notifications_userId_idx" ON "notifications" ("userId");
-- The bell counts unread rows for one user on every page load.
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt");

-- `isVerifiedPurchase` is set at write time from the reviewer's delivered
-- orders, so the badge cannot be forged by the client.
CREATE TABLE "product_reviews" (
  "id"                 TEXT PRIMARY KEY,
  "productId"          TEXT NOT NULL,
  "userId"             TEXT,
  "orderItemId"        TEXT,
  "authorName"         TEXT NOT NULL,
  "rating"             INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "title"              TEXT,
  "body"               TEXT NOT NULL,
  "isVerifiedPurchase" INTEGER NOT NULL DEFAULT 0 CHECK ("isVerifiedPurchase" IN (0, 1)),
  "status"             TEXT NOT NULL DEFAULT 'PUBLISHED'
                         CHECK ("status" IN ('PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN')),
  "helpfulCount"       INTEGER NOT NULL DEFAULT 0 CHECK ("helpfulCount" >= 0),
  -- Merchant response, shown beneath the review on the storefront. Public
  -- text; the moderation note below is not.
  "adminReply"         TEXT,
  "adminReplyAt"       TEXT,
  "adminReplyByUserId" TEXT,
  -- Abuse reports. Denormalised onto the row because the moderation queue
  -- sorts on it, and counting from a reports table on every listing is the
  -- query that would not survive a real catalogue.
  "reportCount"        INTEGER NOT NULL DEFAULT 0 CHECK ("reportCount" >= 0),
  "reportedAt"         TEXT,
  -- Why a moderator last changed the status. Internal only.
  "moderationNote"     TEXT,
  "moderatedAt"        TEXT,
  "moderatedByUserId"  TEXT,
  "createdAt"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("adminReplyByUserId") REFERENCES "users" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("moderatedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL
);
-- One review per customer per product. Anonymous rows carry a NULL userId and
-- SQLite treats those as distinct, so they stay unconstrained — same behaviour
-- the PostgreSQL index had.
CREATE UNIQUE INDEX "product_reviews_productId_userId_key"
  ON "product_reviews" ("productId", "userId");
CREATE INDEX "product_reviews_productId_status_idx" ON "product_reviews" ("productId", "status");
CREATE INDEX "product_reviews_userId_idx" ON "product_reviews" ("userId");
CREATE INDEX "product_reviews_createdAt_idx" ON "product_reviews" ("createdAt");
CREATE INDEX "product_reviews_status_createdAt_idx" ON "product_reviews" ("status", "createdAt");
CREATE INDEX "product_reviews_reportCount_idx" ON "product_reviews" ("reportCount");

CREATE TABLE "newsletter_subscriptions" (
  "id"             TEXT PRIMARY KEY,
  "email"          TEXT NOT NULL,
  "subscribedAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "unsubscribedAt" TEXT,
  "source"         TEXT
);
CREATE UNIQUE INDEX "newsletter_subscriptions_email_key" ON "newsletter_subscriptions" ("email");

CREATE TABLE "audit_logs" (
  "id"          TEXT PRIMARY KEY,
  "actorUserId" TEXT,
  "actorEmail"  TEXT,
  "actorType"   TEXT NOT NULL DEFAULT 'SYSTEM'
                  CHECK ("actorType" IN ('ADMIN', 'CUSTOMER', 'SYSTEM')),
  "action"      TEXT NOT NULL,
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT,
  "before"      TEXT CHECK ("before" IS NULL OR json_valid("before")),
  "after"       TEXT CHECK ("after" IS NULL OR json_valid("after")),
  "reason"      TEXT,
  "ip"          TEXT,
  "createdAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs" ("entityType", "entityId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs" ("createdAt");
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs" ("actorUserId");

CREATE TABLE "site_settings" (
  "key"             TEXT PRIMARY KEY,
  "value"           TEXT NOT NULL CHECK (json_valid("value")),
  "updatedAt"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedByUserId" TEXT
);

CREATE TABLE "content_pages" (
  "key"       TEXT PRIMARY KEY,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE "uploaded_files" (
  "id"               TEXT PRIMARY KEY,
  "bucket"           TEXT NOT NULL,
  "objectKey"        TEXT NOT NULL,
  "originalName"     TEXT NOT NULL,
  "mimeType"         TEXT NOT NULL,
  "sizeBytes"        INTEGER NOT NULL CHECK ("sizeBytes" >= 0),
  "uploadedByUserId" TEXT,
  "createdAt"        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "uploaded_files_objectKey_key" ON "uploaded_files" ("objectKey");

CREATE TABLE "background_job_records" (
  "id"          TEXT PRIMARY KEY,
  "queue"       TEXT NOT NULL,
  "jobId"       TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'QUEUED'
                  CHECK ("status" IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  "payload"     TEXT CHECK ("payload" IS NULL OR json_valid("payload")),
  "attempts"    INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "lastError"   TEXT,
  "createdAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "completedAt" TEXT
);
CREATE UNIQUE INDEX "background_job_records_queue_jobId_key"
  ON "background_job_records" ("queue", "jobId");
CREATE INDEX "background_job_records_status_idx" ON "background_job_records" ("status");
