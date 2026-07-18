/**
 * Money utilities. All amounts are integer minor units (cents).
 * Floating point is never used for arithmetic — only for display formatting.
 */

export function assertMinorUnits(amount: number, label = 'amount'): void {
  if (!Number.isInteger(amount)) {
    throw new Error(`${label} must be an integer amount of minor units, got ${amount}`);
  }
}

/** Format minor units for display, e.g. 1999 -> "19.99 €". */
export function formatMinor(amountMinor: number, currencyCode = 'EUR', locale = 'en'): string {
  assertMinorUnits(amountMinor);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 100);
}

/** Percentage discount between an original and a sale price, rounded down. */
export function discountPercent(originalMinor: number, saleMinor: number): number {
  assertMinorUnits(originalMinor, 'originalMinor');
  assertMinorUnits(saleMinor, 'saleMinor');
  if (originalMinor <= 0 || saleMinor >= originalMinor) return 0;
  return Math.floor(((originalMinor - saleMinor) / originalMinor) * 100);
}

/**
 * VAT included in a gross (tax-inclusive) amount at the given rate in basis
 * points. Prices in this shop are tax-inclusive (EU style); this computes the
 * tax portion for display and reporting.
 */
export function includedTaxMinor(grossMinor: number, taxRateBps: number): number {
  assertMinorUnits(grossMinor, 'grossMinor');
  if (taxRateBps <= 0) return 0;
  return Math.round((grossMinor * taxRateBps) / (10000 + taxRateBps));
}

/** value% of an amount, rounded to nearest minor unit. */
export function percentageOfMinor(amountMinor: number, percent: number): number {
  assertMinorUnits(amountMinor);
  return Math.round((amountMinor * percent) / 100);
}
