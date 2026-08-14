-- A coupon can now waive standard shipping instead of (or as well as)
-- reducing the subtotal, and carries the human-readable description the admin
-- coupon screen lists it by.
ALTER TABLE "coupons" ADD COLUMN "freeShipping" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "coupons" ADD COLUMN "description" TEXT;

-- A free-shipping coupon legitimately has value 0, so the "must grant
-- something" rule moves from "value > 0" to "value > 0 OR it waives shipping".
ALTER TABLE "coupons" ADD CONSTRAINT "coupon_grants_something"
  CHECK ("value" > 0 OR "freeShipping" = true);
