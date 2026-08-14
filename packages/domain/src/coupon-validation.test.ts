import { validateCoupon, type CouponSnapshot, type CouponCartLine } from './coupon-validation';

const baseCoupon: CouponSnapshot = {
  code: 'TEST',
  isActive: true,
  timesRedeemed: 0,
  firstOrderOnly: false,
  brandIds: [],
  categoryIds: [],
  productIds: [],
  campaignIds: [],
};

const lines: CouponCartLine[] = [
  {
    productId: 'p1',
    brandId: 'northline',
    categoryId: 'shoes',
    campaignId: null,
    unitPriceMinor: 5000,
    quantity: 1,
  },
  {
    productId: 'p2',
    brandId: 'aster',
    categoryId: 'tees',
    campaignId: 'c1',
    unitPriceMinor: 2000,
    quantity: 2,
  },
];

const freshCustomer = { customerOrderCount: 0, customerRedemptionsOfThisCoupon: 0 };

describe('validateCoupon', () => {
  it('accepts an unrestricted active coupon and reports the full subtotal', () => {
    const result = validateCoupon(baseCoupon, lines, freshCustomer);
    expect(result).toEqual({ valid: true, eligibleSubtotalMinor: 9000 });
  });

  it('rejects inactive and out-of-window coupons', () => {
    expect(validateCoupon({ ...baseCoupon, isActive: false }, lines, freshCustomer).valid).toBe(
      false,
    );
    expect(
      validateCoupon(
        { ...baseCoupon, startsAt: new Date(Date.now() + 86400000) },
        lines,
        freshCustomer,
      ).valid,
    ).toBe(false);
    expect(
      validateCoupon({ ...baseCoupon, endsAt: new Date(Date.now() - 1000) }, lines, freshCustomer)
        .valid,
    ).toBe(false);
  });

  it('enforces global and per-customer usage limits', () => {
    expect(
      validateCoupon({ ...baseCoupon, maxRedemptions: 5, timesRedeemed: 5 }, lines, freshCustomer)
        .valid,
    ).toBe(false);
    expect(
      validateCoupon({ ...baseCoupon, maxRedemptionsPerCustomer: 1 }, lines, {
        customerOrderCount: 3,
        customerRedemptionsOfThisCoupon: 1,
      }).valid,
    ).toBe(false);
  });

  it('enforces first-order-only', () => {
    const coupon = { ...baseCoupon, firstOrderOnly: true };
    expect(validateCoupon(coupon, lines, freshCustomer).valid).toBe(true);
    expect(
      validateCoupon(coupon, lines, { customerOrderCount: 1, customerRedemptionsOfThisCoupon: 0 })
        .valid,
    ).toBe(false);
  });

  it('restricts by brand and only counts matching lines', () => {
    const coupon = { ...baseCoupon, brandIds: ['northline'] };
    const result = validateCoupon(coupon, lines, freshCustomer);
    expect(result).toEqual({ valid: true, eligibleSubtotalMinor: 5000 });
  });

  it('rejects when no line matches the restrictions', () => {
    const coupon = { ...baseCoupon, brandIds: ['velora'] };
    expect(validateCoupon(coupon, lines, freshCustomer).valid).toBe(false);
  });
});
