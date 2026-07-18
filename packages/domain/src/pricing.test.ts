import {
  effectiveUnitPriceMinor,
  couponDiscountMinor,
  computeCartTotals,
  shippingCostMinor,
  maxRefundableMinor,
} from './pricing';
import { discountPercent, includedTaxMinor, formatMinor } from './money';

const shippingRules = {
  standardShippingMinor: 495,
  expressShippingMinor: 995,
  freeShippingThresholdMinor: 10000,
};

describe('effectiveUnitPriceMinor', () => {
  const base = {
    outletPriceMinor: 2000,
    originalPriceMinor: 3000,
  };

  it('uses the outlet price by default', () => {
    expect(effectiveUnitPriceMinor(base)).toBe(2000);
  });

  it('prefers a variant price override', () => {
    expect(effectiveUnitPriceMinor({ ...base, variantPriceOverrideMinor: 1800 })).toBe(1800);
  });

  it('applies a lower campaign price only while the campaign runs', () => {
    expect(
      effectiveUnitPriceMinor({ ...base, campaignPriceMinor: 1500, campaignIsRunning: true }),
    ).toBe(1500);
    expect(
      effectiveUnitPriceMinor({ ...base, campaignPriceMinor: 1500, campaignIsRunning: false }),
    ).toBe(2000);
  });

  it('ignores a campaign price higher than the base price', () => {
    expect(
      effectiveUnitPriceMinor({ ...base, campaignPriceMinor: 2500, campaignIsRunning: true }),
    ).toBe(2000);
  });
});

describe('couponDiscountMinor', () => {
  it('computes fixed discounts capped at the subtotal', () => {
    expect(couponDiscountMinor({ type: 'FIXED', value: 2000 }, 5000)).toBe(2000);
    expect(couponDiscountMinor({ type: 'FIXED', value: 2000 }, 1500)).toBe(1500);
  });

  it('computes percentage discounts', () => {
    expect(couponDiscountMinor({ type: 'PERCENTAGE', value: 10 }, 5000)).toBe(500);
  });

  it('respects the minimum order value', () => {
    expect(couponDiscountMinor({ type: 'FIXED', value: 2000, minOrderMinor: 10000 }, 9999)).toBe(0);
    expect(couponDiscountMinor({ type: 'FIXED', value: 2000, minOrderMinor: 10000 }, 10000)).toBe(
      2000,
    );
  });

  it('respects the maximum discount cap', () => {
    expect(
      couponDiscountMinor({ type: 'PERCENTAGE', value: 50, maxDiscountMinor: 1000 }, 10000),
    ).toBe(1000);
  });

  it('rejects non-integer subtotals', () => {
    expect(() => couponDiscountMinor({ type: 'FIXED', value: 100 }, 10.5)).toThrow();
  });
});

describe('shippingCostMinor', () => {
  it('charges standard shipping below the free threshold', () => {
    expect(shippingCostMinor(shippingRules, 'STANDARD', 9999)).toBe(495);
  });

  it('grants free standard shipping at the threshold', () => {
    expect(shippingCostMinor(shippingRules, 'STANDARD', 10000)).toBe(0);
  });

  it('always charges express shipping', () => {
    expect(shippingCostMinor(shippingRules, 'EXPRESS', 50000)).toBe(995);
  });
});

describe('computeCartTotals', () => {
  it('computes an order with coupon, shipping, and included tax', () => {
    const totals = computeCartTotals({
      lines: [
        { unitPriceMinor: 1795, quantity: 2, eligibleForCoupon: true },
        { unitPriceMinor: 3899, quantity: 1, eligibleForCoupon: true },
      ],
      coupon: { type: 'PERCENTAGE', value: 10 },
      shippingRules,
      shippingMethod: 'STANDARD',
      taxRateBps: 2000,
    });
    expect(totals.subtotalMinor).toBe(7489);
    expect(totals.couponDiscountMinor).toBe(749);
    expect(totals.shippingMinor).toBe(495); // 6740 < free threshold
    expect(totals.totalMinor).toBe(7489 - 749 + 495);
    expect(totals.taxMinor).toBe(includedTaxMinor(totals.totalMinor, 2000));
  });

  it('only applies coupons to eligible lines', () => {
    const totals = computeCartTotals({
      lines: [
        { unitPriceMinor: 1000, quantity: 1, eligibleForCoupon: true },
        { unitPriceMinor: 9000, quantity: 1, eligibleForCoupon: false },
      ],
      coupon: { type: 'PERCENTAGE', value: 50 },
      shippingRules,
      shippingMethod: 'STANDARD',
      taxRateBps: 2000,
    });
    expect(totals.couponDiscountMinor).toBe(500);
  });

  it('handles an empty cart', () => {
    const totals = computeCartTotals({
      lines: [],
      shippingRules,
      shippingMethod: 'STANDARD',
      taxRateBps: 2000,
    });
    expect(totals.subtotalMinor).toBe(0);
    expect(totals.totalMinor).toBe(495);
  });

  it('rejects fractional prices', () => {
    expect(() =>
      computeCartTotals({
        lines: [{ unitPriceMinor: 19.99 as unknown as number, quantity: 1, eligibleForCoupon: true }],
        shippingRules,
        shippingMethod: 'STANDARD',
        taxRateBps: 2000,
      }),
    ).toThrow();
  });
});

describe('money helpers', () => {
  it('computes discount percent', () => {
    expect(discountPercent(3000, 1795)).toBe(40);
    expect(discountPercent(3000, 3000)).toBe(0);
    expect(discountPercent(0, 100)).toBe(0);
  });

  it('computes included VAT', () => {
    // 120.00 gross at 20% VAT contains 20.00 tax
    expect(includedTaxMinor(12000, 2000)).toBe(2000);
    expect(includedTaxMinor(12000, 0)).toBe(0);
  });

  it('formats minor units', () => {
    expect(formatMinor(1999, 'EUR', 'en')).toContain('19.99');
  });
});

describe('maxRefundableMinor', () => {
  it('computes the refundable remainder', () => {
    expect(maxRefundableMinor(10000, 0)).toBe(10000);
    expect(maxRefundableMinor(10000, 4000)).toBe(6000);
    expect(maxRefundableMinor(10000, 10000)).toBe(0);
    expect(maxRefundableMinor(10000, 12000)).toBe(0);
  });
});
