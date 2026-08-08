import {
  effectiveUnitPriceMinor,
  couponDiscountMinor,
  computeCartTotals,
  shippingCostMinor,
  maxRefundableMinor,
  freeShippingProgress,
  deliveryEstimate,
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
        lines: [
          { unitPriceMinor: 19.99 as unknown as number, quantity: 1, eligibleForCoupon: true },
        ],
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

describe('freeShippingProgress', () => {
  it('reports what is still needed to unlock free shipping', () => {
    expect(freeShippingProgress(shippingRules, 7500)).toEqual({
      thresholdMinor: 10000,
      remainingMinor: 2500,
      qualified: false,
    });
  });

  it('qualifies exactly at the threshold', () => {
    expect(freeShippingProgress(shippingRules, 10000)).toEqual({
      thresholdMinor: 10000,
      remainingMinor: 0,
      qualified: true,
    });
  });

  it('never reports a negative remainder', () => {
    expect(freeShippingProgress(shippingRules, 25000).remainingMinor).toBe(0);
  });

  it('treats "no threshold configured" as already qualified', () => {
    expect(
      freeShippingProgress({ ...shippingRules, freeShippingThresholdMinor: null }, 0).qualified,
    ).toBe(true);
  });

  it('agrees with shippingCostMinor at the boundary', () => {
    for (const subtotal of [0, 9999, 10000, 10001, 50000]) {
      const free = shippingCostMinor(shippingRules, 'STANDARD', subtotal) === 0;
      expect(freeShippingProgress(shippingRules, subtotal).qualified).toBe(free);
    }
  });
});

describe('deliveryEstimate', () => {
  it('skips weekends', () => {
    // 2026-01-01 is a Thursday; +3 working days lands on Tuesday the 6th.
    const estimate = deliveryEstimate('STANDARD', new Date('2026-01-01T09:00:00Z'));
    expect(estimate.earliest).toBe('2026-01-06');
    expect(estimate.latest).toBe('2026-01-08');
  });

  it('is faster for express than standard', () => {
    const now = new Date('2026-03-02T09:00:00Z');
    expect(
      deliveryEstimate('EXPRESS', now).earliest < deliveryEstimate('STANDARD', now).earliest,
    ).toBe(true);
  });

  it('never lands on a weekend', () => {
    for (let offset = 0; offset < 14; offset += 1) {
      const now = new Date(Date.UTC(2026, 4, 1 + offset));
      for (const method of ['STANDARD', 'EXPRESS'] as const) {
        const { earliest, latest } = deliveryEstimate(method, now);
        for (const date of [earliest, latest]) {
          const day = new Date(`${date}T00:00:00Z`).getUTCDay();
          expect(day).not.toBe(0);
          expect(day).not.toBe(6);
        }
      }
    }
  });
});
