/**
 * Coupon lookup.
 *
 * The row is loaded whole and the JSON restriction arrays decoded once, so the
 * rest of the code works with real arrays instead of re-parsing TEXT columns.
 * Eligibility itself lives in @outlet/domain — shared with the PostgreSQL API
 * so the same code decides whether a code applies, whichever stack is running.
 */

import { Db, parseJson } from '../lib/sql';

export interface ResolvedCoupon {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  description: string | null;
  minOrderMinor: number | null;
  maxDiscountMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
  timesRedeemed: number;
  firstOrderOnly: boolean;
  freeShipping: boolean;
  isActive: boolean;
  brandIds: string[];
  categoryIds: string[];
  productIds: string[];
  campaignIds: string[];
}

interface CouponRow {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  description: string | null;
  minOrderMinor: number | null;
  maxDiscountMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
  timesRedeemed: number;
  firstOrderOnly: number;
  freeShipping: number;
  isActive: number;
  brandIds: string;
  categoryIds: string;
  productIds: string;
  campaignIds: string;
}

const SELECT = `
  SELECT "id", "code", "type", "value", "description", "minOrderMinor", "maxDiscountMinor",
         "startsAt", "endsAt", "maxRedemptions", "maxRedemptionsPerCustomer", "timesRedeemed",
         "firstOrderOnly", "freeShipping", "isActive",
         "brandIds", "categoryIds", "productIds", "campaignIds"
    FROM "coupons"`;

function decode(row: CouponRow): ResolvedCoupon {
  return {
    ...row,
    firstOrderOnly: row.firstOrderOnly === 1,
    freeShipping: row.freeShipping === 1,
    isActive: row.isActive === 1,
    brandIds: parseJson<string[]>(row.brandIds, []),
    categoryIds: parseJson<string[]>(row.categoryIds, []),
    productIds: parseJson<string[]>(row.productIds, []),
    campaignIds: parseJson<string[]>(row.campaignIds, []),
  };
}

export async function resolveCoupon(
  db: Db,
  by: { code?: string; couponId?: string },
): Promise<ResolvedCoupon | null> {
  const row = by.couponId
    ? await db.first<CouponRow>(`${SELECT} WHERE "id" = ?`, by.couponId)
    : // Codes are matched case-insensitively: a customer typing "welcome10"
      // has not entered a different coupon from "WELCOME10".
      await db.first<CouponRow>(`${SELECT} WHERE UPPER("code") = UPPER(?)`, by.code ?? '');
  return row ? decode(row) : null;
}

/** How many times one customer has already redeemed a given code. */
export async function redemptionsByCustomer(
  db: Db,
  couponId: string,
  userId: string | null,
): Promise<number> {
  if (!userId) return 0;
  return db.count(
    `SELECT COUNT(*) AS "c" FROM "orders" WHERE "couponId" = ? AND "userId" = ? AND "status" <> 'CANCELLED'`,
    couponId,
    userId,
  );
}

/** Completed orders for a customer — the input to `firstOrderOnly`. */
export async function orderCountForCustomer(db: Db, userId: string | null): Promise<number> {
  if (!userId) return 0;
  return db.count(
    `SELECT COUNT(*) AS "c" FROM "orders" WHERE "userId" = ? AND "status" <> 'CANCELLED'`,
    userId,
  );
}
