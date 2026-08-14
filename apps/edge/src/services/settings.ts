/**
 * Store settings, read from the database rather than compiled in.
 *
 * Shipping prices, the free-shipping threshold, the tax rate and the
 * reservation window are all things an administrator changes, so they live in
 * `site_settings` and are read per request. The defaults below exist only so a
 * database that has not been seeded still answers coherently instead of
 * charging zero for delivery.
 */

import { Db, parseJson } from '../lib/sql';

export interface StoreSettings {
  reservationDurationMinutes: number;
  lowStockThreshold: number;
  standardShippingMinor: number;
  expressShippingMinor: number;
  freeShippingThresholdMinor: number | null;
  taxRateBps: number;
  currencyCode: string;
  storeName: string;
  supportEmail: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaLabel: string;
  heroCtaHref: string;
}

const DEFAULTS: StoreSettings = {
  reservationDurationMinutes: 20,
  lowStockThreshold: 5,
  standardShippingMinor: 495,
  expressShippingMinor: 995,
  freeShippingThresholdMinor: 10000,
  taxRateBps: 2000,
  currencyCode: 'EUR',
  storeName: 'Outlet Marketplace',
  supportEmail: 'support@demo.local',
  heroHeadline: 'Outlet prices on the brands you already wear',
  heroSubheadline: 'Limited quantities, released in short campaigns.',
  heroCtaLabel: 'Shop the outlet',
  heroCtaHref: '/shop',
};

export async function readSettings(db: Db): Promise<StoreSettings> {
  const rows = await db.all<{ key: string; value: string }>(
    `SELECT "key", "value" FROM "site_settings"`,
  );

  const settings = { ...DEFAULTS } as Record<string, unknown>;
  for (const row of rows) {
    if (!(row.key in DEFAULTS)) continue;
    const value = parseJson<unknown>(row.value, undefined);
    // A stored value of the wrong type is worse than no stored value: it would
    // put a string where the pricing code expects minor units.
    if (typeof value === typeof DEFAULTS[row.key as keyof StoreSettings] || value === null) {
      settings[row.key] = value;
    }
  }
  return settings as unknown as StoreSettings;
}

export const shippingRulesFrom = (settings: StoreSettings) => ({
  standardShippingMinor: settings.standardShippingMinor,
  expressShippingMinor: settings.expressShippingMinor,
  freeShippingThresholdMinor: settings.freeShippingThresholdMinor,
});
