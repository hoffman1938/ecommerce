import { assertMinorUnits, includedTaxMinor, percentageOfMinor } from './money';

/**
 * Pricing rules:
 * - A variant's base price is its override or the product outlet price.
 * - When bought through a running campaign that lists the product, the
 *   campaign price applies if it is lower.
 * - Coupons apply to the eligible subtotal after campaign pricing.
 * - The backend always recomputes everything; client totals are never
 *   trusted.
 */

export interface PriceContext {
  outletPriceMinor: number;
  originalPriceMinor: number;
  variantPriceOverrideMinor?: number | null;
  campaignPriceMinor?: number | null;
  campaignIsRunning?: boolean;
}

/** Effective unit price for a variant, considering campaign pricing. */
export function effectiveUnitPriceMinor(ctx: PriceContext): number {
  const base = ctx.variantPriceOverrideMinor ?? ctx.outletPriceMinor;
  assertMinorUnits(base, 'basePrice');
  if (ctx.campaignIsRunning && ctx.campaignPriceMinor != null && ctx.campaignPriceMinor < base) {
    return ctx.campaignPriceMinor;
  }
  return base;
}

export interface CouponRules {
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  minOrderMinor?: number | null;
  maxDiscountMinor?: number | null;
}

/**
 * Discount a coupon grants on an eligible subtotal. Returns 0 when the
 * minimum order value is not met. Never exceeds the eligible subtotal.
 */
export function couponDiscountMinor(coupon: CouponRules, eligibleSubtotalMinor: number): number {
  assertMinorUnits(eligibleSubtotalMinor, 'eligibleSubtotal');
  if (eligibleSubtotalMinor <= 0) return 0;
  if (coupon.minOrderMinor != null && eligibleSubtotalMinor < coupon.minOrderMinor) return 0;

  let discount =
    coupon.type === 'FIXED' ? coupon.value : percentageOfMinor(eligibleSubtotalMinor, coupon.value);

  if (coupon.maxDiscountMinor != null) {
    discount = Math.min(discount, coupon.maxDiscountMinor);
  }
  return Math.max(0, Math.min(discount, eligibleSubtotalMinor));
}

export interface ShippingRules {
  standardShippingMinor: number;
  expressShippingMinor: number;
  freeShippingThresholdMinor: number | null;
}

export function shippingCostMinor(
  rules: ShippingRules,
  method: 'STANDARD' | 'EXPRESS',
  subtotalAfterDiscountMinor: number,
): number {
  if (
    method === 'STANDARD' &&
    rules.freeShippingThresholdMinor != null &&
    subtotalAfterDiscountMinor >= rules.freeShippingThresholdMinor
  ) {
    return 0;
  }
  return method === 'EXPRESS' ? rules.expressShippingMinor : rules.standardShippingMinor;
}

export interface CartTotalsInput {
  lines: Array<{ unitPriceMinor: number; quantity: number; eligibleForCoupon: boolean }>;
  coupon?: CouponRules | null;
  shippingRules: ShippingRules;
  shippingMethod: 'STANDARD' | 'EXPRESS';
  taxRateBps: number;
}

export interface CartTotals {
  subtotalMinor: number;
  couponDiscountMinor: number;
  shippingMinor: number;
  /** VAT already included in (subtotal - discount + shipping). */
  taxMinor: number;
  totalMinor: number;
}

/** Single source of truth for order/cart totals. */
export function computeCartTotals(input: CartTotalsInput): CartTotals {
  const subtotal = input.lines.reduce((sum, line) => {
    assertMinorUnits(line.unitPriceMinor, 'unitPrice');
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      throw new Error(`Invalid quantity ${line.quantity}`);
    }
    return sum + line.unitPriceMinor * line.quantity;
  }, 0);

  const eligibleSubtotal = input.lines.reduce(
    (sum, line) => (line.eligibleForCoupon ? sum + line.unitPriceMinor * line.quantity : sum),
    0,
  );

  const discount = input.coupon ? couponDiscountMinor(input.coupon, eligibleSubtotal) : 0;
  const discountedSubtotal = subtotal - discount;
  const shipping = shippingCostMinor(input.shippingRules, input.shippingMethod, discountedSubtotal);
  const total = discountedSubtotal + shipping;
  const tax = includedTaxMinor(total, input.taxRateBps);

  return {
    subtotalMinor: subtotal,
    couponDiscountMinor: discount,
    shippingMinor: shipping,
    taxMinor: tax,
    totalMinor: total,
  };
}

export interface FreeShippingProgress {
  thresholdMinor: number;
  remainingMinor: number;
  qualified: boolean;
}

/**
 * How far a cart is from free standard shipping. Computed here rather than in
 * the UI so the figure the customer is nudged toward is the same one the
 * shipping calculation uses — the two drifting apart is how "spend €5 more"
 * ends up still charging for delivery.
 *
 * Returns `qualified` when the shop has no threshold configured, since in that
 * case there is nothing left to unlock.
 */
export function freeShippingProgress(
  rules: ShippingRules,
  subtotalAfterDiscountMinor: number,
): FreeShippingProgress {
  const threshold = rules.freeShippingThresholdMinor;
  if (threshold == null) {
    return { thresholdMinor: 0, remainingMinor: 0, qualified: true };
  }
  const remaining = Math.max(0, threshold - subtotalAfterDiscountMinor);
  return { thresholdMinor: threshold, remainingMinor: remaining, qualified: remaining === 0 };
}

export interface DeliveryEstimate {
  earliest: string;
  latest: string;
}

/** Working days a method takes, as [earliest, latest]. */
const TRANSIT_DAYS: Record<'STANDARD' | 'EXPRESS', [number, number]> = {
  STANDARD: [3, 5],
  EXPRESS: [1, 2],
};

function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

/**
 * Delivery window for a shipping method, skipping weekends. Dates only (no
 * time), because promising an hour the warehouse cannot honour is worse than
 * promising a day.
 */
export function deliveryEstimate(
  method: 'STANDARD' | 'EXPRESS',
  now: Date = new Date(),
): DeliveryEstimate {
  const [min, max] = TRANSIT_DAYS[method];
  return {
    earliest: addWorkingDays(now, min).toISOString().slice(0, 10),
    latest: addWorkingDays(now, max).toISOString().slice(0, 10),
  };
}

/** Refundable remainder for an order given previous refunds. */
export function maxRefundableMinor(orderTotalMinor: number, alreadyRefundedMinor: number): number {
  assertMinorUnits(orderTotalMinor);
  assertMinorUnits(alreadyRefundedMinor);
  return Math.max(0, orderTotalMinor - alreadyRefundedMinor);
}
