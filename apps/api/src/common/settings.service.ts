import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface BusinessSettings {
  reservationDurationMinutes: number;
  lowStockThreshold: number;
  standardShippingMinor: number;
  expressShippingMinor: number;
  freeShippingThresholdMinor: number | null;
  taxRateBps: number;
}

const KEYS = {
  reservationDurationMinutes: 'reservation_duration_minutes',
  lowStockThreshold: 'low_stock_threshold',
  standardShippingMinor: 'standard_shipping_minor',
  expressShippingMinor: 'express_shipping_minor',
  freeShippingThresholdMinor: 'free_shipping_threshold_minor',
  taxRateBps: 'tax_rate_bps',
} as const;

const DEFAULTS: BusinessSettings = {
  reservationDurationMinutes: 20,
  lowStockThreshold: 5,
  standardShippingMinor: 495,
  expressShippingMinor: 995,
  freeShippingThresholdMinor: 10000,
  taxRateBps: 2000,
};

/**
 * Admin-editable business settings stored in PostgreSQL with a short
 * in-process cache. The reservation duration lives here (spec: configurable
 * in admin settings; default 20 minutes).
 */
@Injectable()
export class SettingsService {
  private cache: BusinessSettings | null = null;
  private cacheLoadedAt = 0;
  private readonly cacheTtlMs = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<BusinessSettings> {
    const now = Date.now();
    if (this.cache && now - this.cacheLoadedAt < this.cacheTtlMs) return this.cache;

    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: Object.values(KEYS) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string, fallback: number): number => {
      const v = byKey.get(key);
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    };
    const nullableNum = (key: string, fallback: number | null): number | null => {
      const v = byKey.get(key);
      if (v === null) return null;
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    };

    this.cache = {
      reservationDurationMinutes: num(KEYS.reservationDurationMinutes, DEFAULTS.reservationDurationMinutes),
      lowStockThreshold: num(KEYS.lowStockThreshold, DEFAULTS.lowStockThreshold),
      standardShippingMinor: num(KEYS.standardShippingMinor, DEFAULTS.standardShippingMinor),
      expressShippingMinor: num(KEYS.expressShippingMinor, DEFAULTS.expressShippingMinor),
      freeShippingThresholdMinor: nullableNum(
        KEYS.freeShippingThresholdMinor,
        DEFAULTS.freeShippingThresholdMinor,
      ),
      taxRateBps: num(KEYS.taxRateBps, DEFAULTS.taxRateBps),
    };
    this.cacheLoadedAt = now;
    return this.cache;
  }

  async update(settings: BusinessSettings, updatedByUserId: string): Promise<void> {
    const entries: Array<[string, number | null]> = [
      [KEYS.reservationDurationMinutes, settings.reservationDurationMinutes],
      [KEYS.lowStockThreshold, settings.lowStockThreshold],
      [KEYS.standardShippingMinor, settings.standardShippingMinor],
      [KEYS.expressShippingMinor, settings.expressShippingMinor],
      [KEYS.freeShippingThresholdMinor, settings.freeShippingThresholdMinor],
      [KEYS.taxRateBps, settings.taxRateBps],
    ];
    for (const [key, value] of entries) {
      await this.prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: value as never, updatedByUserId },
        update: { value: value as never, updatedByUserId },
      });
    }
    this.cache = null;
  }
}
