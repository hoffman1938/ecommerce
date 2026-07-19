import { Injectable } from '@nestjs/common';
import { Prisma } from '@outlet/database';
import type { DashboardStatsDto } from '@outlet/types';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../../common/settings.service';

/** Statuses that count as realized revenue. */
const REVENUE_STATUSES = [
  'PAID',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'RETURN_REQUESTED',
  'PARTIALLY_RETURNED',
  'RETURNED',
] as const;

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async stats(): Promise<DashboardStatsDto> {
    const settings = await this.settings.get();
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [revenueAgg, orderCount, failedPaymentCount, activeCampaignCount, upcomingCampaignCount, openReturnCount, activeReservationCount, expiredReservationCount, recentOrders] =
      await Promise.all([
        this.prisma.order.aggregate({
          _sum: { totalMinor: true },
          where: { status: { in: [...REVENUE_STATUSES] } },
        }),
        this.prisma.order.count({ where: { status: { in: [...REVENUE_STATUSES] } } }),
        this.prisma.payment.count({ where: { status: 'FAILED' } }),
        this.prisma.campaign.count({
          where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
        }),
        this.prisma.campaign.count({ where: { status: 'SCHEDULED', startsAt: { gt: now } } }),
        this.prisma.returnRequest.count({
          where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
        }),
        this.prisma.inventoryReservation.count({
          where: {
            status: { in: ['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING'] },
            expiresAt: { gt: now },
          },
        }),
        this.prisma.inventoryReservation.count({ where: { status: 'EXPIRED' } }),
        this.prisma.order.findMany({
          where: { status: { not: 'DRAFT' } },
          orderBy: { placedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            email: true,
            totalMinor: true,
            status: true,
            placedAt: true,
          },
        }),
      ]);

    const lowStockRows = await this.prisma.$queryRaw<
      Array<{ variantId: string; sku: string; productName: string; available: number }>
    >(Prisma.sql`
      SELECT ib."variantId" AS "variantId", v."sku" AS "sku", p."name" AS "productName",
             (ib."onHandQuantity" - ib."reservedQuantity") AS "available"
      FROM "inventory_balances" ib
      JOIN "product_variants" v ON v."id" = ib."variantId"
      JOIN "products" p ON p."id" = v."productId"
      WHERE v."isEnabled" = true AND p."status" = 'ACTIVE'
        AND (ib."onHandQuantity" - ib."reservedQuantity") <= ${settings.lowStockThreshold}
      ORDER BY "available" ASC
      LIMIT 10
    `);

    const salesByDay = await this.prisma.$queryRaw<
      Array<{ day: Date; revenue: bigint; orders: bigint }>
    >(Prisma.sql`
      SELECT DATE_TRUNC('day', o."placedAt") AS "day",
             SUM(o."totalMinor")::bigint AS "revenue",
             COUNT(*)::bigint AS "orders"
      FROM "orders" o
      WHERE o."status"::text = ANY(${Prisma.sql`ARRAY[${Prisma.join([...REVENUE_STATUSES])}]`})
        AND o."placedAt" >= ${fourteenDaysAgo}
      GROUP BY 1 ORDER BY 1 ASC
    `);

    const salesByBrand = await this.prisma.$queryRaw<
      Array<{ brandName: string; revenue: bigint; units: bigint }>
    >(Prisma.sql`
      SELECT (oi."productSnapshot"->>'brandName') AS "brandName",
             SUM(oi."totalMinor")::bigint AS "revenue",
             SUM(oi."quantity")::bigint AS "units"
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."orderId"
      WHERE o."status"::text = ANY(${Prisma.sql`ARRAY[${Prisma.join([...REVENUE_STATUSES])}]`})
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `);

    const salesByCampaign = await this.prisma.$queryRaw<
      Array<{ campaignTitle: string; revenue: bigint; units: bigint }>
    >(Prisma.sql`
      SELECT c."title" AS "campaignTitle",
             SUM(oi."totalMinor")::bigint AS "revenue",
             SUM(oi."quantity")::bigint AS "units"
      FROM "order_items" oi
      JOIN "campaigns" c ON c."id" = oi."campaignId"
      JOIN "orders" o ON o."id" = oi."orderId"
      WHERE o."status"::text = ANY(${Prisma.sql`ARRAY[${Prisma.join([...REVENUE_STATUSES])}]`})
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `);

    const revenueMinor = revenueAgg._sum.totalMinor ?? 0;
    return {
      revenueMinor,
      orderCount,
      averageOrderValueMinor: orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0,
      lowStockCount: lowStockRows.length,
      activeReservationCount,
      expiredReservationCount,
      failedPaymentCount,
      activeCampaignCount,
      upcomingCampaignCount,
      openReturnCount,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        email: o.email,
        totalMinor: o.totalMinor,
        status: o.status,
        placedAt: o.placedAt.toISOString(),
      })),
      salesByDay: salesByDay.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        revenueMinor: Number(row.revenue),
        orderCount: Number(row.orders),
      })),
      salesByBrand: salesByBrand.map((row) => ({
        brandName: row.brandName ?? 'Unknown',
        revenueMinor: Number(row.revenue),
        unitsSold: Number(row.units),
      })),
      salesByCampaign: salesByCampaign.map((row) => ({
        campaignTitle: row.campaignTitle,
        revenueMinor: Number(row.revenue),
        unitsSold: Number(row.units),
      })),
      lowStockVariants: lowStockRows.map((row) => ({
        variantId: row.variantId,
        sku: row.sku,
        productName: row.productName,
        availableQuantity: Number(row.available),
      })),
    };
  }
}
