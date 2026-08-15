/**
 * Demo checkout.
 *
 * No money moves. There is no payment provider, no card is collected, and the
 * "payment" is a row this code writes itself and immediately marks successful.
 * That is the whole point: the flow around it is real so it can be reviewed,
 * and the part that would move money is deliberately absent rather than
 * stubbed behind a credential that might one day be filled in.
 *
 * Everything else *is* real:
 *
 *  - Every price comes from the database. The request body carries an address
 *    and a shipping method and nothing else; a client that posts `total: 1`
 *    has posted a field this code does not read.
 *  - Stock is committed inside the same D1 batch as the order, so an order and
 *    the stock it consumed either both exist or neither does.
 *  - A repeated submission returns the original order instead of placing a
 *    second one — the double-click case, enforced by a unique index rather
 *    than by hope.
 */

import type { AddressDto, ShippingMethod } from '@outlet/types';
import { computeCartTotals } from '@outlet/domain';
import { ApiError } from '../lib/errors';
import { formatOrderNumber, newId } from '../lib/ids';
import { Db, nowIso, toJson } from '../lib/sql';
import { readSettings, shippingRulesFrom } from './settings';
import { commitStatements } from './inventory';
import { orderCountForCustomer, redemptionsByCustomer, resolveCoupon } from './coupons';
import { notify } from './inbox';

export interface CheckoutInput {
  email: string;
  shippingAddress: AddressDto;
  billingAddress?: AddressDto | null;
  shippingMethod: ShippingMethod;
  customerNote?: string | null;
  /** Supplied by the client so a retry is recognised as the same attempt. */
  idempotencyKey?: string | null;
  /**
   * The total the customer was shown. Never used to price anything — only to
   * refuse an order whose price moved while the checkout page was open.
   */
  expectedTotalMinor?: number;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  totalMinor: number;
  currencyCode: string;
  paymentId: string;
  /** True when this call found an order the caller had already placed. */
  alreadyPlaced: boolean;
}

interface PayableLine {
  cartItemId: string;
  variantId: string;
  productId: string;
  brandId: string;
  categoryId: string | null;
  campaignId: string | null;
  quantity: number;
  sku: string;
  productName: string;
  brandName: string;
  productSlug: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  originalPriceMinor: number;
  outletPriceMinor: number;
  priceOverrideMinor: number | null;
  campaignPriceMinor: number | null;
  campaignStatus: string | null;
  onHand: number;
  available: number;
  reservationId: string | null;
  reservationQuantity: number | null;
}

/**
 * Reads the lines the order will be built from, with everything needed to
 * price and commit them — and *only* rows that are genuinely purchasable.
 *
 * The `available` figure adds back this cart's own reservation, because those
 * units are held for this shopper: without that, a cart holding the last unit
 * would fail its own stock check.
 */
async function readPayableLines(db: Db, cartId: string): Promise<PayableLine[]> {
  const now = nowIso();
  return db.all<PayableLine>(
    `SELECT ci."id" AS "cartItemId", ci."variantId", ci."quantity", ci."campaignId",
            v."sku", v."size", v."color", v."priceOverrideMinor",
            p."id" AS "productId", p."name" AS "productName", p."slug" AS "productSlug",
            p."originalPriceMinor", p."outletPriceMinor", p."categoryId",
            b."id" AS "brandId", b."name" AS "brandName",
            -- See the note in services/cart.ts: D1 rejects an outer reference
            -- inside a subquery's ORDER BY, so the colourway preference is
            -- expressed as two correlated subqueries instead.
            COALESCE(
              (SELECT i."url" FROM "product_images" i
                WHERE i."productId" = p."id" AND i."variantId" = v."id"
                ORDER BY i."position" LIMIT 1),
              (SELECT i."url" FROM "product_images" i
                WHERE i."productId" = p."id"
                ORDER BY i."position" LIMIT 1)
            ) AS "imageUrl",
            COALESCE(ib."onHandQuantity", 0) AS "onHand",
            MAX(0, COALESCE(ib."onHandQuantity", 0) - COALESCE(ib."reservedQuantity", 0)
                   + COALESCE(r."quantity", 0)) AS "available",
            r."id" AS "reservationId", r."quantity" AS "reservationQuantity",
            cp."campaignPriceMinor", ca."status" AS "campaignStatus"
       FROM "cart_items" ci
       JOIN "product_variants" v ON v."id" = ci."variantId"
       JOIN "products" p ON p."id" = v."productId"
       JOIN "brands" b ON b."id" = p."brandId"
       LEFT JOIN "inventory_balances" ib ON ib."variantId" = v."id"
       LEFT JOIN "inventory_reservations" r
              ON r."cartItemId" = ci."id"
             AND r."status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')
             AND r."expiresAt" > ?
       LEFT JOIN "campaigns" ca
              ON ca."id" = ci."campaignId" AND ca."status" = 'ACTIVE'
             AND ca."startsAt" <= ? AND ca."endsAt" > ?
       LEFT JOIN "campaign_products" cp
              ON cp."campaignId" = ca."id" AND cp."productId" = p."id"
      WHERE ci."cartId" = ?
        AND ci."savedForLater" = 0
        AND p."status" = 'ACTIVE'
        AND v."isEnabled" = 1
      ORDER BY ci."createdAt"`,
    now,
    now,
    now,
    cartId,
  );
}

const unitPriceFor = (line: PayableLine): number => {
  const base = line.priceOverrideMinor ?? line.outletPriceMinor;
  if (
    line.campaignStatus === 'ACTIVE' &&
    line.campaignPriceMinor != null &&
    line.campaignPriceMinor < base
  ) {
    return line.campaignPriceMinor;
  }
  return base;
};

function assertAddress(address: AddressDto | null | undefined, label: string): AddressDto {
  if (!address) throw new ApiError('VALIDATION_FAILED', `A ${label} address is required.`);
  const required: Array<keyof AddressDto> = [
    'firstName',
    'lastName',
    'line1',
    'city',
    'postalCode',
    'countryCode',
  ];
  for (const field of required) {
    const value = address[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ApiError('VALIDATION_FAILED', `The ${label} address is missing ${String(field)}.`, {
        field: `${label}.${String(field)}`,
      });
    }
  }
  // Stored as a snapshot on the order, so it is trimmed to the fields the
  // schema knows about rather than persisting whatever the client sent.
  return {
    firstName: address.firstName.trim().slice(0, 100),
    lastName: address.lastName.trim().slice(0, 100),
    line1: address.line1.trim().slice(0, 200),
    line2: address.line2?.trim().slice(0, 200) ?? null,
    city: address.city.trim().slice(0, 100),
    region: address.region?.trim().slice(0, 100) ?? null,
    postalCode: address.postalCode.trim().slice(0, 20),
    countryCode: address.countryCode.trim().toUpperCase().slice(0, 2),
    phone: address.phone?.trim().slice(0, 40) ?? null,
  };
}

/**
 * The order a previous submission with this key already produced, if any.
 *
 * Looked up *before* the cart is resolved, because placing the order converts
 * the cart: by the time a double-clicked second request arrives there is no
 * active cart left, and answering "your cart is empty" to someone whose order
 * went through is the worst possible reply.
 */
export async function findOrderByIdempotencyKey(
  db: Db,
  idempotencyKey: string | null | undefined,
): Promise<CheckoutResult | null> {
  if (!idempotencyKey) return null;

  const existing = await db.first<{
    id: string;
    orderNumber: string;
    totalMinor: number;
    currencyCode: string;
  }>(
    `SELECT "id", "orderNumber", "totalMinor", "currencyCode" FROM "orders" WHERE "checkoutIdempotencyKey" = ?`,
    idempotencyKey.slice(0, 100),
  );
  if (!existing) return null;

  const payment = await db.first<{ id: string }>(
    `SELECT "id" FROM "payments" WHERE "orderId" = ? ORDER BY "createdAt" LIMIT 1`,
    existing.id,
  );
  return {
    orderId: existing.id,
    orderNumber: existing.orderNumber,
    totalMinor: existing.totalMinor,
    currencyCode: existing.currencyCode,
    paymentId: payment?.id ?? '',
    alreadyPlaced: true,
  };
}

export async function placeDemoOrder(
  db: Db,
  context: { cartId: string; couponId: string | null; userId: string | null },
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const idempotencyKey = input.idempotencyKey?.slice(0, 100) || null;

  // Checked again here so a caller that reaches this function directly is
  // still protected; the unique index is the real guarantee when two retries
  // arrive at once.
  const replay = await findOrderByIdempotencyKey(db, idempotencyKey);
  if (replay) return replay;

  const shippingAddress = assertAddress(input.shippingAddress, 'shipping');
  const billingAddress = input.billingAddress
    ? assertAddress(input.billingAddress, 'billing')
    : shippingAddress;
  const shippingMethod: ShippingMethod =
    input.shippingMethod === 'EXPRESS' ? 'EXPRESS' : 'STANDARD';

  const email = input.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw new ApiError('VALIDATION_FAILED', 'A valid email address is required.', {
      field: 'email',
    });
  }

  const lines = await readPayableLines(db, context.cartId);
  if (lines.length === 0) {
    throw new ApiError('CART_EMPTY', 'Your cart is empty.');
  }

  // Stock, checked against the database rather than against what the cart page
  // last displayed.
  for (const line of lines) {
    if (line.reservationId === null) {
      throw new ApiError(
        'RESERVATIONS_EXPIRED',
        'Your hold on some items expired. Please review your cart and try again.',
      );
    }
    if (line.quantity > line.available) {
      throw new ApiError('OUT_OF_STOCK', `${line.productName} only has ${line.available} left.`);
    }
  }

  const settings = await readSettings(db);
  const coupon = context.couponId ? await resolveCoupon(db, { couponId: context.couponId }) : null;

  // Coupon eligibility is re-evaluated here, not carried over from the cart:
  // a code can expire or hit its limit between adding it and paying.
  let appliedCoupon = null as typeof coupon;
  if (coupon) {
    const now = nowIso();
    const [customerOrders, customerRedemptions] = await Promise.all([
      orderCountForCustomer(db, context.userId),
      redemptionsByCustomer(db, coupon.id, context.userId),
    ]);
    const usable =
      coupon.isActive &&
      (!coupon.startsAt || coupon.startsAt <= now) &&
      (!coupon.endsAt || coupon.endsAt >= now) &&
      (coupon.maxRedemptions == null || coupon.timesRedeemed < coupon.maxRedemptions) &&
      (coupon.maxRedemptionsPerCustomer == null ||
        customerRedemptions < coupon.maxRedemptionsPerCustomer) &&
      (!coupon.firstOrderOnly || customerOrders === 0);
    if (usable) appliedCoupon = coupon;
  }

  const restricted =
    appliedCoupon != null &&
    (appliedCoupon.brandIds.length > 0 ||
      appliedCoupon.categoryIds.length > 0 ||
      appliedCoupon.productIds.length > 0 ||
      appliedCoupon.campaignIds.length > 0);

  const eligible = (line: PayableLine): boolean => {
    if (!appliedCoupon || !restricted) return true;
    if (appliedCoupon.productIds.includes(line.productId)) return true;
    if (appliedCoupon.brandIds.includes(line.brandId)) return true;
    if (line.categoryId && appliedCoupon.categoryIds.includes(line.categoryId)) return true;
    if (line.campaignId && appliedCoupon.campaignIds.includes(line.campaignId)) return true;
    return false;
  };

  const totals = computeCartTotals({
    lines: lines.map((line) => ({
      unitPriceMinor: unitPriceFor(line),
      quantity: line.quantity,
      eligibleForCoupon: eligible(line),
    })),
    coupon: appliedCoupon
      ? {
          type: appliedCoupon.type,
          value: appliedCoupon.value,
          minOrderMinor: appliedCoupon.minOrderMinor,
          maxDiscountMinor: appliedCoupon.maxDiscountMinor,
          freeShipping: appliedCoupon.freeShipping,
        }
      : null,
    shippingRules: shippingRulesFrom(settings),
    shippingMethod,
    taxRateBps: settings.taxRateBps,
  });

  /*
   * The one place the client's number is looked at, and it can only stop the
   * order. A campaign that ended, a coupon that hit its limit, or stock priced
   * differently since the page loaded all land here — and the customer sees
   * the new total rather than being charged it silently.
   */
  if (input.expectedTotalMinor !== undefined && input.expectedTotalMinor !== totals.totalMinor) {
    throw new ApiError('TOTALS_CHANGED', 'Prices changed while you were checking out.', {
      totalMinor: totals.totalMinor,
    });
  }

  const orderId = newId();
  const paymentId = newId();
  const now = nowIso();
  const sequence = await db.count(`SELECT COUNT(*) AS "c" FROM "orders"`);
  const orderNumber = formatOrderNumber(sequence + 1);

  const statements: D1PreparedStatement[] = [];

  statements.push(
    db.statement(
      `INSERT INTO "orders"
         ("id", "orderNumber", "userId", "email", "status", "currencyCode",
          "subtotalMinor", "discountMinor", "shippingMinor", "taxMinor", "totalMinor",
          "couponId", "couponCode", "shippingAddress", "billingAddress", "shippingMethod",
          "customerNote", "checkoutIdempotencyKey", "placedAt", "paidAt", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'PAID', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      orderNumber,
      context.userId,
      email,
      settings.currencyCode,
      totals.subtotalMinor,
      totals.couponDiscountMinor,
      totals.shippingMinor,
      totals.taxMinor,
      totals.totalMinor,
      appliedCoupon?.id ?? null,
      appliedCoupon?.code ?? null,
      toJson(shippingAddress),
      toJson(billingAddress),
      shippingMethod,
      input.customerNote?.slice(0, 500) ?? null,
      idempotencyKey,
      now,
      now,
      now,
      now,
    ),
  );

  for (const line of lines) {
    const unitPriceMinor = unitPriceFor(line);
    const lineTotal = unitPriceMinor * line.quantity;
    statements.push(
      db.statement(
        `INSERT INTO "order_items"
           ("id", "orderId", "variantId", "campaignId", "productSnapshot", "sku", "name",
            "quantity", "unitPriceMinor", "originalUnitPriceMinor", "taxRateBps", "taxMinor", "totalMinor")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        orderId,
        line.variantId,
        line.campaignId,
        // A snapshot, because a historical order must not change when the
        // product it refers to is renamed, repriced or archived.
        toJson({
          productId: line.productId,
          slug: line.productSlug,
          name: line.productName,
          brand: line.brandName,
          color: line.color,
          size: line.size,
          imageUrl: line.imageUrl,
        }),
        line.sku,
        line.productName,
        line.quantity,
        unitPriceMinor,
        line.originalPriceMinor,
        settings.taxRateBps,
        Math.round((lineTotal * settings.taxRateBps) / (10000 + settings.taxRateBps)),
        lineTotal,
      ),
    );

    statements.push(
      ...commitStatements(db, {
        reservationId: line.reservationId!,
        variantId: line.variantId,
        quantity: line.quantity,
        orderId,
        orderNumber,
        previousOnHand: line.onHand,
      }),
    );
  }

  for (const [index, status] of ['AWAITING_PAYMENT', 'PAID'].entries()) {
    statements.push(
      db.statement(
        `INSERT INTO "order_status_history" ("id", "orderId", "fromStatus", "toStatus", "note", "createdAt")
         VALUES (?, ?, ?, ?, ?, ?)`,
        newId(),
        orderId,
        index === 0 ? null : 'AWAITING_PAYMENT',
        status,
        index === 0 ? 'Order placed' : 'Demo payment accepted — no real money was charged',
        now,
      ),
    );
  }

  // The demo payment. `provider: 'demo'` is the only provider this build knows.
  statements.push(
    db.statement(
      `INSERT INTO "payments"
         ("id", "orderId", "provider", "providerPaymentId", "idempotencyKey", "status",
          "amountMinor", "currencyCode", "createdAt", "updatedAt")
       VALUES (?, ?, 'demo', ?, ?, 'PAID', ?, ?, ?, ?)`,
      paymentId,
      orderId,
      `DEMO-${orderNumber}`,
      idempotencyKey ? `pay-${idempotencyKey}` : null,
      totals.totalMinor,
      settings.currencyCode,
      now,
      now,
    ),
    db.statement(
      `INSERT INTO "payment_events"
         ("id", "paymentId", "provider", "providerEventId", "type", "payload", "processedAt", "createdAt")
       VALUES (?, ?, 'demo', ?, 'payment.succeeded', ?, ?, ?)`,
      newId(),
      paymentId,
      `DEMO-EVT-${orderNumber}`,
      toJson({ demo: true, orderNumber, amountMinor: totals.totalMinor, realMoney: false }),
      now,
      now,
    ),
  );

  if (appliedCoupon) {
    statements.push(
      db.statement(
        `UPDATE "coupons" SET "timesRedeemed" = "timesRedeemed" + 1, "updatedAt" = ? WHERE "id" = ?`,
        now,
        appliedCoupon.id,
      ),
    );
  }

  if (context.userId) {
    statements.push(
      ...notify(db, {
        userId: context.userId,
        type: 'ORDER_PLACED',
        title: `Order ${orderNumber} confirmed`,
        body: `We have received your demo order ${orderNumber}. No real payment was taken.`,
        email,
        orderId,
        template: 'order_confirmation',
        at: now,
      }),
    );
  }

  // The cart converts in the same transaction, so a placed order cannot leave
  // a basket behind that still looks buyable.
  statements.push(
    db.statement(
      `DELETE FROM "cart_items" WHERE "cartId" = ? AND "savedForLater" = 0`,
      context.cartId,
    ),
    db.statement(
      `UPDATE "carts" SET "status" = 'CONVERTED', "couponId" = NULL, "updatedAt" = ? WHERE "id" = ?`,
      now,
      context.cartId,
    ),
  );

  await db.batch(statements);

  return {
    orderId,
    orderNumber,
    totalMinor: totals.totalMinor,
    currencyCode: settings.currencyCode,
    paymentId,
    alreadyPlaced: false,
  };
}
