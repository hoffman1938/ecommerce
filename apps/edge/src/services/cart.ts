/**
 * The cart.
 *
 * Two things about it are load-bearing:
 *
 *  1. **Prices are never accepted from the client.** A cart line stores the
 *     price the server looked up at the moment it was added, and every read
 *     re-derives the current one from the product, its variant override and any
 *     running campaign. If they disagree the line is repriced and the customer
 *     is told. Nothing the browser posts can make a €90 jacket cost €1.
 *  2. **A line in the cart holds real stock.** Adding an item takes an
 *     inventory reservation for a fixed window; the reservation expiring hands
 *     the units back. This is what makes "2 left" mean two.
 *
 * Anonymous and signed-in carts are the same rows: an anonymous cart carries a
 * token in a cookie, and signing in merges it into the customer's own.
 */

import type { CartDto, CartItemDto, ShippingMethod } from '@outlet/types';
import { computeCartTotals, deliveryEstimate, freeShippingProgress } from '@outlet/domain';
import { ApiError, badRequest, notFound } from '../lib/errors';
import { newId, newToken } from '../lib/ids';
import { Db, bool, fromBool, nowIso } from '../lib/sql';
import { readSettings, shippingRulesFrom, type StoreSettings } from './settings';
import { HOLDING_STATUSES, readAvailability, release, reserve } from './inventory';
import { resolveCoupon, type ResolvedCoupon } from './coupons';

/** One item cannot be used to buy out the whole stock of a popular line. */
const MAX_QUANTITY_PER_LINE = 10;

export interface CartOwner {
  userId: string | null;
  /** Present for anonymous shoppers; issued on first write. */
  anonymousToken: string | null;
}

export interface ResolvedCart {
  id: string;
  couponId: string | null;
  /** Set when this call created the cart, so the caller can send the cookie. */
  issuedToken: string | null;
}

/**
 * Finds the caller's cart, creating one only when they are about to write.
 *
 * A plain `GET /cart` from a browser that has never added anything does not
 * create a row — otherwise every crawler would leave one behind.
 */
export async function resolveCart(
  db: Db,
  owner: CartOwner,
  options: { create: boolean } = { create: false },
): Promise<ResolvedCart | null> {
  if (owner.userId) {
    const existing = await db.first<{ id: string; couponId: string | null }>(
      `SELECT "id", "couponId" FROM "carts" WHERE "userId" = ? AND "status" = 'ACTIVE' ORDER BY "updatedAt" DESC LIMIT 1`,
      owner.userId,
    );
    if (existing) return { ...existing, issuedToken: null };
    if (!options.create) return null;

    const id = newId();
    await db.run(
      `INSERT INTO "carts" ("id", "userId", "status") VALUES (?, ?, 'ACTIVE')`,
      id,
      owner.userId,
    );
    return { id, couponId: null, issuedToken: null };
  }

  if (owner.anonymousToken) {
    const existing = await db.first<{ id: string; couponId: string | null }>(
      `SELECT "id", "couponId" FROM "carts" WHERE "anonymousToken" = ? AND "status" = 'ACTIVE'`,
      owner.anonymousToken,
    );
    if (existing) return { ...existing, issuedToken: null };
  }

  if (!options.create) return null;

  const id = newId();
  const token = owner.anonymousToken ?? newToken();
  await db.run(
    `INSERT INTO "carts" ("id", "anonymousToken", "status") VALUES (?, ?, 'ACTIVE')`,
    id,
    token,
  );
  return { id, couponId: null, issuedToken: token };
}

interface CartLineRow {
  id: string;
  variantId: string;
  quantity: number;
  unitPriceMinor: number;
  savedForLater: number;
  campaignId: string | null;
  campaignTitle: string | null;
  campaignPriceMinor: number | null;
  campaignStatus: string | null;
  campaignStartsAt: string | null;
  campaignEndsAt: string | null;
  sku: string;
  size: string | null;
  color: string | null;
  variantEnabled: number;
  priceOverrideMinor: number | null;
  productId: string;
  productSlug: string;
  productName: string;
  productStatus: string;
  outletPriceMinor: number;
  originalPriceMinor: number;
  categoryId: string | null;
  brandId: string;
  brandName: string;
  imageUrl: string | null;
  available: number;
  reservationId: string | null;
  reservationStatus: string | null;
  reservationExpiresAt: string | null;
}

/**
 * Every line of a cart in one query.
 *
 * Includes what pricing needs (product, variant override, running campaign),
 * what stock validation needs (availability, reservation) and what the UI
 * needs (image, brand). A cart with twelve lines costs one round trip.
 */
async function readLines(db: Db, cartId: string): Promise<CartLineRow[]> {
  const now = nowIso();
  return db.all<CartLineRow>(
    `SELECT ci."id", ci."variantId", ci."quantity", ci."unitPriceMinor", ci."savedForLater",
            ca."id" AS "campaignId", ca."title" AS "campaignTitle",
            cp."campaignPriceMinor", ca."status" AS "campaignStatus",
            ca."startsAt" AS "campaignStartsAt", ca."endsAt" AS "campaignEndsAt",
            v."sku", v."size", v."color", v."isEnabled" AS "variantEnabled", v."priceOverrideMinor",
            p."id" AS "productId", p."slug" AS "productSlug", p."name" AS "productName",
            p."status" AS "productStatus", p."outletPriceMinor", p."originalPriceMinor",
            p."categoryId",
            b."id" AS "brandId", b."name" AS "brandName",
            -- The colourway's own shot when there is one, otherwise the
            -- product's first. Two correlated subqueries rather than one with
            -- a CASE in its ORDER BY: D1's SQLite rejects an outer-query
            -- reference inside a subquery's ORDER BY, though it is happy with
            -- one in a WHERE. (node:sqlite accepts both, so the unit tests do
            -- not catch it — this only shows up against real D1.)
            COALESCE(
              (SELECT i."url" FROM "product_images" i
                WHERE i."productId" = p."id" AND i."variantId" = v."id"
                ORDER BY i."position" LIMIT 1),
              (SELECT i."url" FROM "product_images" i
                WHERE i."productId" = p."id"
                ORDER BY i."position" LIMIT 1)
            ) AS "imageUrl",
            MAX(0, COALESCE(ib."onHandQuantity", 0) - COALESCE(ib."reservedQuantity", 0)
                   + COALESCE(r."heldQuantity", 0)) AS "available",
            r."reservationId", r."reservationStatus", r."reservationExpiresAt"
       FROM "cart_items" ci
       JOIN "product_variants" v ON v."id" = ci."variantId"
       JOIN "products" p ON p."id" = v."productId"
       JOIN "brands" b ON b."id" = p."brandId"
       LEFT JOIN "inventory_balances" ib ON ib."variantId" = v."id"
       -- Grouped, *not* joined row-wise. Topping a line up takes a second
       -- reservation for the added units (see addItem), so a plain join
       -- returns the line once per hold — the same item listed twice at full
       -- quantity, with the subtotal and bag count doubled to match.
       --
       -- MIN("expiresAt") picks the hold that lapses first, which is the one
       -- the countdown must show; SQLite lets the bare "id"/"status" columns
       -- come from that same row. "heldQuantity" is every hold together, so
       -- availability adds back all of this shopper's own units rather than
       -- one arbitrary reservation's.
       LEFT JOIN (
              SELECT "cartItemId",
                     "id" AS "reservationId",
                     "status" AS "reservationStatus",
                     MIN("expiresAt") AS "reservationExpiresAt",
                     SUM("quantity") AS "heldQuantity"
                FROM "inventory_reservations"
               WHERE "status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')
                 AND "expiresAt" > ?
               GROUP BY "cartItemId"
            ) r ON r."cartItemId" = ci."id"
       LEFT JOIN "campaigns" ca
              ON ca."id" = ci."campaignId" AND ca."status" = 'ACTIVE'
             AND ca."startsAt" <= ? AND ca."endsAt" > ?
       LEFT JOIN "campaign_products" cp
              ON cp."campaignId" = ca."id" AND cp."productId" = p."id"
      WHERE ci."cartId" = ?
      ORDER BY ci."createdAt"`,
    now,
    now,
    now,
    cartId,
  );
}

/**
 * The price this line should cost right now.
 *
 * Order of precedence matches the domain rules: a variant override wins over
 * the product's outlet price, and a running campaign wins over both when it is
 * cheaper. Deliberately recomputed rather than trusted from `cart_items`,
 * which is what catches a campaign starting or ending while a cart sat open.
 */
function currentUnitPrice(line: CartLineRow): number {
  const base = line.priceOverrideMinor ?? line.outletPriceMinor;
  const campaignRunning = line.campaignStatus === 'ACTIVE';
  if (campaignRunning && line.campaignPriceMinor != null && line.campaignPriceMinor < base) {
    return line.campaignPriceMinor;
  }
  return base;
}

function toItemDto(line: CartLineRow, unitPriceMinor: number, message: string | null): CartItemDto {
  const expiresAt = line.reservationExpiresAt;
  return {
    id: line.id,
    variantId: line.variantId,
    productId: line.productId,
    productSlug: line.productSlug,
    productName: line.productName,
    brandName: line.brandName,
    sku: line.sku,
    size: line.size,
    color: line.color,
    imageUrl: line.imageUrl,
    quantity: line.quantity,
    unitPriceMinor,
    originalUnitPriceMinor: line.originalPriceMinor,
    lineTotalMinor: unitPriceMinor * line.quantity,
    campaignId: line.campaignId,
    campaignTitle: line.campaignTitle,
    reservation:
      line.reservationId && expiresAt
        ? {
            id: line.reservationId,
            status: line.reservationStatus as CartItemDto['reservation'] extends null
              ? never
              : NonNullable<CartItemDto['reservation']>['status'],
            expiresAt,
            // Computed from the stored deadline, so a client with a skewed
            // clock cannot extend its own hold on stock.
            secondsRemaining: Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)),
          }
        : null,
    isExpired: !line.savedForLater && line.reservationId === null,
    message,
  };
}

export interface CartView extends CartDto {
  /** Lines whose price or availability changed since they were added. */
  repriced: boolean;
}

/**
 * Builds the cart a customer sees, and repairs it as it goes.
 *
 * A cart is a document that ages: campaigns end, stock sells, products get
 * withdrawn. Rather than showing a stale total and failing at checkout, each
 * read reconciles the lines against the catalogue and reports what changed.
 */
export async function readCart(
  db: Db,
  cartId: string,
  couponId: string | null,
  context: { userId: string | null; shippingMethod?: ShippingMethod },
  settings?: StoreSettings,
): Promise<CartView> {
  const resolvedSettings = settings ?? (await readSettings(db));
  const lines = await readLines(db, cartId);
  const messages: string[] = [];
  let repriced = false;

  const active: Array<{ line: CartLineRow; unitPriceMinor: number; message: string | null }> = [];
  const saved: Array<{ line: CartLineRow; unitPriceMinor: number; message: string | null }> = [];

  for (const line of lines) {
    const unitPriceMinor = currentUnitPrice(line);
    let message: string | null = null;

    if (unitPriceMinor !== line.unitPriceMinor) {
      repriced = true;
      message =
        unitPriceMinor < line.unitPriceMinor
          ? 'The price of this item has come down.'
          : 'The price of this item has changed.';
      await db.run(
        `UPDATE "cart_items" SET "unitPriceMinor" = ?, "updatedAt" = ? WHERE "id" = ?`,
        unitPriceMinor,
        nowIso(),
        line.id,
      );
    }

    const purchasable = line.productStatus === 'ACTIVE' && fromBool(line.variantEnabled);
    if (!purchasable) {
      message = 'This item is no longer available.';
    } else if (!fromBool(line.savedForLater) && line.reservationId === null) {
      message = 'Your hold on this item expired. Add it again to check stock.';
    } else if (line.quantity > line.available) {
      message = `Only ${line.available} left in stock.`;
    }

    const entry = { line, unitPriceMinor, message };
    if (fromBool(line.savedForLater)) saved.push(entry);
    else active.push(entry);
    if (message && !fromBool(line.savedForLater)) messages.push(`${line.productName}: ${message}`);
  }

  // Only lines that are actually purchasable right now count toward money.
  const payable = active.filter(
    (entry) =>
      entry.line.productStatus === 'ACTIVE' &&
      fromBool(entry.line.variantEnabled) &&
      entry.line.reservationId !== null,
  );

  const coupon = couponId ? await resolveCoupon(db, { couponId }) : null;
  const couponRules = couponApplies(coupon, payable, context.userId)
    ? {
        type: coupon!.type,
        value: coupon!.value,
        minOrderMinor: coupon!.minOrderMinor,
        maxDiscountMinor: coupon!.maxDiscountMinor,
        freeShipping: coupon!.freeShipping,
      }
    : null;

  const shippingMethod = context.shippingMethod ?? 'STANDARD';
  const totals = computeCartTotals({
    lines: payable.map((entry) => ({
      unitPriceMinor: entry.unitPriceMinor,
      quantity: Math.min(entry.line.quantity, entry.line.available),
      eligibleForCoupon: coupon ? couponCoversLine(coupon, entry.line) : true,
    })),
    coupon: couponRules,
    shippingRules: shippingRulesFrom(resolvedSettings),
    shippingMethod,
    taxRateBps: resolvedSettings.taxRateBps,
  });

  const itemCount = payable.reduce((sum, entry) => sum + entry.line.quantity, 0);

  return {
    id: cartId,
    items: active.map((entry) => toItemDto(entry.line, entry.unitPriceMinor, entry.message)),
    savedForLater: saved.map((entry) => toItemDto(entry.line, entry.unitPriceMinor, entry.message)),
    currencyCode: resolvedSettings.currencyCode,
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.couponDiscountMinor,
    shippingMinor: totals.shippingMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    couponCode: couponRules ? (coupon?.code ?? null) : null,
    couponDiscountMinor: totals.couponDiscountMinor,
    itemCount,
    freeShipping: freeShippingProgress(
      shippingRulesFrom(resolvedSettings),
      totals.subtotalMinor - totals.couponDiscountMinor,
    ),
    deliveryEstimate:
      itemCount > 0 ? { ...deliveryEstimate(shippingMethod), method: shippingMethod } : null,
    messages,
    repriced,
  };
}

function couponCoversLine(coupon: ResolvedCoupon, line: CartLineRow): boolean {
  const restricted =
    coupon.brandIds.length > 0 ||
    coupon.categoryIds.length > 0 ||
    coupon.productIds.length > 0 ||
    coupon.campaignIds.length > 0;
  if (!restricted) return true;
  if (coupon.productIds.includes(line.productId)) return true;
  if (coupon.brandIds.includes(line.brandId)) return true;
  if (line.categoryId && coupon.categoryIds.includes(line.categoryId)) return true;
  if (line.campaignId && coupon.campaignIds.includes(line.campaignId)) return true;
  return false;
}

function couponApplies(
  coupon: ResolvedCoupon | null,
  payable: Array<{ line: CartLineRow }>,
  _userId: string | null,
): boolean {
  if (!coupon) return false;
  if (!coupon.isActive) return false;
  const now = nowIso();
  if (coupon.startsAt && coupon.startsAt > now) return false;
  if (coupon.endsAt && coupon.endsAt < now) return false;
  return payable.some((entry) => couponCoversLine(coupon, entry.line));
}

// --- Mutations ---------------------------------------------------------------

export async function addItem(
  db: Db,
  cart: ResolvedCart,
  owner: CartOwner,
  input: { variantId: string; quantity: number; campaignId?: string | null },
): Promise<void> {
  const quantity = Math.floor(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
    throw badRequest(`Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}.`);
  }

  const variant = await readAvailability(db, input.variantId);
  if (!variant) throw notFound('That product option does not exist.');
  if (variant.productStatus !== 'ACTIVE' || !fromBool(variant.isEnabled)) {
    throw new ApiError('BAD_REQUEST', 'That option is not available to buy.');
  }

  const settings = await readSettings(db);
  const existing = await db.first<{ id: string; quantity: number }>(
    `SELECT "id", "quantity" FROM "cart_items" WHERE "cartId" = ? AND "variantId" = ?`,
    cart.id,
    input.variantId,
  );

  const targetQuantity = Math.min(MAX_QUANTITY_PER_LINE, (existing?.quantity ?? 0) + quantity);
  const additional = targetQuantity - (existing?.quantity ?? 0);
  if (additional <= 0) {
    throw badRequest(`You can order at most ${MAX_QUANTITY_PER_LINE} of this item.`);
  }

  // The price is read here, from the database, and stored. The client's idea
  // of what this costs never enters the calculation.
  const price = await currentPriceForVariant(db, input.variantId, input.campaignId ?? null);

  const cartItemId = existing?.id ?? newId();
  if (existing) {
    await db.run(
      `UPDATE "cart_items" SET "quantity" = ?, "unitPriceMinor" = ?, "savedForLater" = 0, "updatedAt" = ? WHERE "id" = ?`,
      targetQuantity,
      price.unitPriceMinor,
      nowIso(),
      existing.id,
    );
  } else {
    await db.run(
      `INSERT INTO "cart_items" ("id", "cartId", "variantId", "campaignId", "quantity", "unitPriceMinor")
       VALUES (?, ?, ?, ?, ?, ?)`,
      cartItemId,
      cart.id,
      input.variantId,
      price.campaignId,
      targetQuantity,
      price.unitPriceMinor,
    );
  }

  // Reserve only the units newly added; the existing hold still stands.
  try {
    await reserve(db, {
      variantId: input.variantId,
      quantity: additional,
      cartId: cart.id,
      cartItemId,
      userId: owner.userId,
      sessionToken: owner.anonymousToken,
      durationMinutes: settings.reservationDurationMinutes,
    });
  } catch (error) {
    // The reservation is the authority on whether this add succeeds, so a
    // refusal has to undo the line rather than leave stock the cart cannot hold.
    if (existing) {
      await db.run(
        `UPDATE "cart_items" SET "quantity" = ?, "updatedAt" = ? WHERE "id" = ?`,
        existing.quantity,
        nowIso(),
        existing.id,
      );
    } else {
      await db.run(`DELETE FROM "cart_items" WHERE "id" = ?`, cartItemId);
    }
    throw error;
  }

  await touch(db, cart.id);
}

/** Current price for a variant, including any running campaign it belongs to. */
export async function currentPriceForVariant(
  db: Db,
  variantId: string,
  preferredCampaignId: string | null,
): Promise<{ unitPriceMinor: number; campaignId: string | null }> {
  const now = nowIso();
  const row = await db.first<{
    base: number;
    campaignId: string | null;
    campaignPriceMinor: number | null;
  }>(
    `SELECT COALESCE(v."priceOverrideMinor", p."outletPriceMinor") AS "base",
            ca."id" AS "campaignId", cp."campaignPriceMinor"
       FROM "product_variants" v
       JOIN "products" p ON p."id" = v."productId"
       LEFT JOIN "campaign_products" cp ON cp."productId" = p."id"
       LEFT JOIN "campaigns" ca
              ON ca."id" = cp."campaignId" AND ca."status" = 'ACTIVE' AND ca."isVisible" = 1
             AND ca."startsAt" <= ? AND ca."endsAt" > ?
      WHERE v."id" = ?
      ORDER BY (CASE WHEN ca."id" = ? THEN 0 ELSE 1 END),
               COALESCE(cp."campaignPriceMinor", 999999999) ASC
      LIMIT 1`,
    now,
    now,
    variantId,
    preferredCampaignId ?? '',
  );

  if (!row) throw notFound('That product option does not exist.');
  if (row.campaignId && row.campaignPriceMinor != null && row.campaignPriceMinor < row.base) {
    return { unitPriceMinor: row.campaignPriceMinor, campaignId: row.campaignId };
  }
  return { unitPriceMinor: row.base, campaignId: null };
}

export async function updateQuantity(
  db: Db,
  cart: ResolvedCart,
  owner: CartOwner,
  cartItemId: string,
  quantity: number,
): Promise<void> {
  const next = Math.floor(quantity);
  if (!Number.isFinite(next) || next < 0 || next > MAX_QUANTITY_PER_LINE) {
    throw badRequest(`Quantity must be between 0 and ${MAX_QUANTITY_PER_LINE}.`);
  }
  if (next === 0) return removeItem(db, cart, cartItemId);

  const line = await ownedLine(db, cart.id, cartItemId);
  const settings = await readSettings(db);
  const held = await heldQuantity(db, cartItemId);

  if (next > held) {
    await reserve(db, {
      variantId: line.variantId,
      quantity: next - held,
      cartId: cart.id,
      cartItemId,
      userId: owner.userId,
      sessionToken: owner.anonymousToken,
      durationMinutes: settings.reservationDurationMinutes,
    });
  } else if (next < held) {
    await releaseDown(db, cartItemId, held - next);
  }

  await db.run(
    `UPDATE "cart_items" SET "quantity" = ?, "updatedAt" = ? WHERE "id" = ?`,
    next,
    nowIso(),
    cartItemId,
  );
  await touch(db, cart.id);
}

export async function removeItem(db: Db, cart: ResolvedCart, cartItemId: string): Promise<void> {
  await ownedLine(db, cart.id, cartItemId);
  await releaseAll(db, cartItemId, 'Removed from cart');
  await db.run(`DELETE FROM "cart_items" WHERE "id" = ? AND "cartId" = ?`, cartItemId, cart.id);
  await touch(db, cart.id);
}

/**
 * Parking an item.
 *
 * The reservation is released — a saved item is explicitly *not* holding stock,
 * which is the whole difference between "save for later" and "leave it in the
 * basket". Restoring it has to compete for stock again like anything else.
 */
export async function saveForLater(db: Db, cart: ResolvedCart, cartItemId: string): Promise<void> {
  await ownedLine(db, cart.id, cartItemId);
  await releaseAll(db, cartItemId, 'Saved for later');
  await db.run(
    `UPDATE "cart_items" SET "savedForLater" = 1, "updatedAt" = ? WHERE "id" = ? AND "cartId" = ?`,
    nowIso(),
    cartItemId,
    cart.id,
  );
  await touch(db, cart.id);
}

export async function restoreSaved(
  db: Db,
  cart: ResolvedCart,
  owner: CartOwner,
  cartItemId: string,
): Promise<void> {
  const line = await ownedLine(db, cart.id, cartItemId);
  const settings = await readSettings(db);

  await reserve(db, {
    variantId: line.variantId,
    quantity: line.quantity,
    cartId: cart.id,
    cartItemId,
    userId: owner.userId,
    sessionToken: owner.anonymousToken,
    durationMinutes: settings.reservationDurationMinutes,
  });

  await db.run(
    `UPDATE "cart_items" SET "savedForLater" = 0, "updatedAt" = ? WHERE "id" = ?`,
    nowIso(),
    cartItemId,
  );
  await touch(db, cart.id);
}

export async function clearCart(db: Db, cart: ResolvedCart): Promise<void> {
  const lines = await db.all<{ id: string }>(
    `SELECT "id" FROM "cart_items" WHERE "cartId" = ?`,
    cart.id,
  );
  for (const line of lines) await releaseAll(db, line.id, 'Cart cleared');
  await db.run(`DELETE FROM "cart_items" WHERE "cartId" = ?`, cart.id);
  await db.run(
    `UPDATE "carts" SET "couponId" = NULL, "updatedAt" = ? WHERE "id" = ?`,
    nowIso(),
    cart.id,
  );
}

export async function applyCoupon(
  db: Db,
  cart: ResolvedCart,
  code: string | null,
): Promise<{ couponId: string | null }> {
  if (code === null) {
    await db.run(
      `UPDATE "carts" SET "couponId" = NULL, "updatedAt" = ? WHERE "id" = ?`,
      nowIso(),
      cart.id,
    );
    return { couponId: null };
  }

  const coupon = await resolveCoupon(db, { code });
  if (!coupon) throw new ApiError('INVALID_COUPON', 'That code is not recognised.');
  if (!coupon.isActive) throw new ApiError('INVALID_COUPON', 'That code is no longer active.');

  const now = nowIso();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new ApiError('INVALID_COUPON', 'That code is not active yet.');
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw new ApiError('INVALID_COUPON', 'That code has expired.');
  }
  if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    throw new ApiError('INVALID_COUPON', 'That code has reached its usage limit.');
  }

  await db.run(
    `UPDATE "carts" SET "couponId" = ?, "updatedAt" = ? WHERE "id" = ?`,
    coupon.id,
    nowIso(),
    cart.id,
  );
  return { couponId: coupon.id };
}

/**
 * Folds an anonymous cart into the signed-in one.
 *
 * Called at login. Quantities are added rather than replaced, and the
 * anonymous cart is marked MERGED rather than deleted so the history is not
 * lost. Reservations follow their lines.
 */
export async function mergeAnonymousCart(
  db: Db,
  anonymousToken: string,
  userId: string,
): Promise<void> {
  const anonymous = await db.first<{ id: string; couponId: string | null }>(
    `SELECT "id", "couponId" FROM "carts" WHERE "anonymousToken" = ? AND "status" = 'ACTIVE'`,
    anonymousToken,
  );
  if (!anonymous) return;

  const target = await resolveCart(db, { userId, anonymousToken: null }, { create: true });
  if (!target || target.id === anonymous.id) return;

  const lines = await db.all<{
    id: string;
    variantId: string;
    quantity: number;
    savedForLater: number;
  }>(
    `SELECT "id", "variantId", "quantity", "savedForLater" FROM "cart_items" WHERE "cartId" = ?`,
    anonymous.id,
  );

  for (const line of lines) {
    const existing = await db.first<{ id: string; quantity: number }>(
      `SELECT "id", "quantity" FROM "cart_items" WHERE "cartId" = ? AND "variantId" = ?`,
      target.id,
      line.variantId,
    );
    if (existing) {
      // The target already holds this variant, so the anonymous line's stock
      // is handed back rather than double-held.
      await releaseAll(db, line.id, 'Merged into signed-in cart');
      await db.run(
        `UPDATE "cart_items" SET "quantity" = ?, "updatedAt" = ? WHERE "id" = ?`,
        Math.min(MAX_QUANTITY_PER_LINE, existing.quantity + line.quantity),
        nowIso(),
        existing.id,
      );
      await db.run(`DELETE FROM "cart_items" WHERE "id" = ?`, line.id);
    } else {
      await db.run(
        `UPDATE "cart_items" SET "cartId" = ?, "updatedAt" = ? WHERE "id" = ?`,
        target.id,
        nowIso(),
        line.id,
      );
      await db.run(
        `UPDATE "inventory_reservations" SET "cartId" = ?, "userId" = ?, "updatedAt" = ? WHERE "cartItemId" = ?`,
        target.id,
        userId,
        nowIso(),
        line.id,
      );
    }
  }

  if (anonymous.couponId) {
    await db.run(
      `UPDATE "carts" SET "couponId" = COALESCE("couponId", ?), "updatedAt" = ? WHERE "id" = ?`,
      anonymous.couponId,
      nowIso(),
      target.id,
    );
  }
  await db.run(
    `UPDATE "carts" SET "status" = 'MERGED', "anonymousToken" = NULL, "updatedAt" = ? WHERE "id" = ?`,
    nowIso(),
    anonymous.id,
  );
}

// --- Internals ---------------------------------------------------------------

/**
 * Loads a line *and proves it belongs to this cart*.
 *
 * Every mutation goes through here. Without it, `DELETE /cart/items/:id` would
 * happily remove a line from somebody else's basket — the cart equivalent of
 * an IDOR. 404 rather than 403, so the API does not confirm the id exists.
 */
async function ownedLine(
  db: Db,
  cartId: string,
  cartItemId: string,
): Promise<{ id: string; variantId: string; quantity: number }> {
  const line = await db.first<{ id: string; variantId: string; quantity: number }>(
    `SELECT "id", "variantId", "quantity" FROM "cart_items" WHERE "id" = ? AND "cartId" = ?`,
    cartItemId,
    cartId,
  );
  if (!line) throw notFound('That item is not in your cart.');
  return line;
}

async function heldQuantity(db: Db, cartItemId: string): Promise<number> {
  const row = await db.first<{ held: number }>(
    `SELECT COALESCE(SUM("quantity"), 0) AS "held"
       FROM "inventory_reservations"
      WHERE "cartItemId" = ? AND "status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')
        AND "expiresAt" > ?`,
    cartItemId,
    nowIso(),
  );
  return row?.held ?? 0;
}

async function releaseAll(db: Db, cartItemId: string, reason: string): Promise<void> {
  const reservations = await db.all<{ id: string }>(
    `SELECT "id" FROM "inventory_reservations"
      WHERE "cartItemId" = ? AND "status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')`,
    cartItemId,
  );
  for (const reservation of reservations) await release(db, reservation.id, reason);
}

/** Gives back exactly `amount` units, trimming reservations newest-first. */
async function releaseDown(db: Db, cartItemId: string, amount: number): Promise<void> {
  let remaining = amount;
  const reservations = await db.all<{ id: string; quantity: number; variantId: string }>(
    `SELECT "id", "quantity", "variantId" FROM "inventory_reservations"
      WHERE "cartItemId" = ? AND "status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')
      ORDER BY "createdAt" DESC`,
    cartItemId,
  );

  for (const reservation of reservations) {
    if (remaining <= 0) break;
    if (reservation.quantity <= remaining) {
      await release(db, reservation.id, 'Quantity reduced');
      remaining -= reservation.quantity;
    } else {
      await db.batch([
        db.statement(
          `UPDATE "inventory_reservations" SET "quantity" = "quantity" - ?, "updatedAt" = ? WHERE "id" = ?`,
          remaining,
          nowIso(),
          reservation.id,
        ),
        db.statement(
          `UPDATE "inventory_balances" SET "reservedQuantity" = MAX(0, "reservedQuantity" - ?), "updatedAt" = ? WHERE "variantId" = ?`,
          remaining,
          nowIso(),
          reservation.variantId,
        ),
      ]);
      remaining = 0;
    }
  }
}

const touch = (db: Db, cartId: string) =>
  db.run(`UPDATE "carts" SET "updatedAt" = ? WHERE "id" = ?`, nowIso(), cartId);

export { HOLDING_STATUSES, bool };
