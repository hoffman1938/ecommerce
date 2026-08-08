/**
 * Coupon eligibility rules, independent from persistence. The API feeds this
 * with data loaded from PostgreSQL.
 */

export interface CouponSnapshot {
  code: string;
  isActive: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxRedemptions?: number | null;
  maxRedemptionsPerCustomer?: number | null;
  timesRedeemed: number;
  firstOrderOnly: boolean;
  brandIds: string[];
  categoryIds: string[];
  productIds: string[];
  campaignIds: string[];
}

export interface CouponCartLine {
  productId: string;
  brandId: string;
  categoryId?: string | null;
  campaignId?: string | null;
  unitPriceMinor: number;
  quantity: number;
}

export interface CouponCustomerContext {
  customerOrderCount: number;
  customerRedemptionsOfThisCoupon: number;
}

export type CouponValidationResult =
  { valid: true; eligibleSubtotalMinor: number } | { valid: false; reason: string };

export function lineMatchesCouponRestrictions(
  coupon: CouponSnapshot,
  line: CouponCartLine,
): boolean {
  const hasRestrictions =
    coupon.brandIds.length > 0 ||
    coupon.categoryIds.length > 0 ||
    coupon.productIds.length > 0 ||
    coupon.campaignIds.length > 0;
  if (!hasRestrictions) return true;
  if (coupon.productIds.includes(line.productId)) return true;
  if (coupon.brandIds.includes(line.brandId)) return true;
  if (line.categoryId && coupon.categoryIds.includes(line.categoryId)) return true;
  if (line.campaignId && coupon.campaignIds.includes(line.campaignId)) return true;
  return false;
}

export function validateCoupon(
  coupon: CouponSnapshot,
  lines: CouponCartLine[],
  customer: CouponCustomerContext,
  now: Date = new Date(),
): CouponValidationResult {
  if (!coupon.isActive) return { valid: false, reason: 'This coupon is not active.' };
  if (coupon.startsAt && now < coupon.startsAt) {
    return { valid: false, reason: 'This coupon is not active yet.' };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { valid: false, reason: 'This coupon has expired.' };
  }
  if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    return { valid: false, reason: 'This coupon has reached its usage limit.' };
  }
  if (
    coupon.maxRedemptionsPerCustomer != null &&
    customer.customerRedemptionsOfThisCoupon >= coupon.maxRedemptionsPerCustomer
  ) {
    return { valid: false, reason: 'You have already used this coupon.' };
  }
  if (coupon.firstOrderOnly && customer.customerOrderCount > 0) {
    return { valid: false, reason: 'This coupon is only valid on your first order.' };
  }

  const eligibleSubtotalMinor = lines.reduce(
    (sum, line) =>
      lineMatchesCouponRestrictions(coupon, line) ? sum + line.unitPriceMinor * line.quantity : sum,
    0,
  );
  if (eligibleSubtotalMinor <= 0) {
    return { valid: false, reason: 'This coupon does not apply to the items in your cart.' };
  }
  return { valid: true, eligibleSubtotalMinor };
}
