/**
 * Stock, and the reservations that hold it.
 *
 * The model, unchanged from the PostgreSQL implementation:
 *
 *   available = onHandQuantity - reservedQuantity
 *
 * Adding to a cart *reserves* units for a fixed window; placing an order
 * *commits* them (on-hand falls, reserved falls, sold rises); the reservation
 * expiring releases them again. Nothing is ever decremented on the strength of
 * a number the client sent.
 *
 * Concurrency is handled by making the reservation a conditional UPDATE:
 *
 *   UPDATE inventory_balances
 *      SET reservedQuantity = reservedQuantity + ?
 *    WHERE variantId = ? AND onHandQuantity - reservedQuantity >= ?
 *
 * The database evaluates the predicate and the write as one statement, so two
 * requests racing for the last unit cannot both see it free — the loser
 * changes zero rows and is told the item just sold out. The CHECK constraint
 * `reservedQuantity <= onHandQuantity` is the backstop underneath, and would
 * abort the transaction if this logic were ever wrong.
 */

import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { Db, isoPlusMs, nowIso } from '../lib/sql';

export interface VariantAvailability {
  variantId: string;
  productId: string;
  sku: string;
  size: string | null;
  color: string | null;
  isEnabled: number;
  productStatus: string;
  onHand: number;
  reserved: number;
  available: number;
}

export async function readAvailability(
  db: Db,
  variantId: string,
): Promise<VariantAvailability | null> {
  return db.first<VariantAvailability>(
    `SELECT v."id" AS "variantId", v."productId", v."sku", v."size", v."color", v."isEnabled",
            p."status" AS "productStatus",
            COALESCE(b."onHandQuantity", 0) AS "onHand",
            COALESCE(b."reservedQuantity", 0) AS "reserved",
            MAX(0, COALESCE(b."onHandQuantity", 0) - COALESCE(b."reservedQuantity", 0)) AS "available"
       FROM "product_variants" v
       JOIN "products" p ON p."id" = v."productId"
       LEFT JOIN "inventory_balances" b ON b."variantId" = v."id"
      WHERE v."id" = ?`,
    variantId,
  );
}

/**
 * Reserves `quantity` units, or throws.
 *
 * Returns the reservation id. The caller is expected to have already checked
 * that the product is purchasable — this function's single job is the atomic
 * claim on stock.
 */
export async function reserve(
  db: Db,
  input: {
    variantId: string;
    quantity: number;
    cartId: string;
    cartItemId?: string | null;
    userId?: string | null;
    sessionToken?: string | null;
    durationMinutes: number;
  },
): Promise<string> {
  const claimed = await db.run(
    `UPDATE "inventory_balances"
        SET "reservedQuantity" = "reservedQuantity" + ?,
            "version" = "version" + 1,
            "updatedAt" = ?
      WHERE "variantId" = ?
        AND "onHandQuantity" - "reservedQuantity" >= ?`,
    input.quantity,
    nowIso(),
    input.variantId,
    input.quantity,
  );

  if (Db.changes(claimed) === 0) {
    throw new ApiError('OUT_OF_STOCK', 'There is not enough stock left for that quantity.');
  }

  const reservationId = newId();
  await db.run(
    `INSERT INTO "inventory_reservations"
       ("id", "cartId", "cartItemId", "userId", "sessionToken", "variantId", "quantity",
        "status", "expiresAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    reservationId,
    input.cartId,
    input.cartItemId ?? null,
    input.userId ?? null,
    input.sessionToken ?? null,
    input.variantId,
    input.quantity,
    isoPlusMs(input.durationMinutes * 60 * 1000),
  );

  return reservationId;
}

/** Hands units back. Used when an item leaves the cart or a reservation lapses. */
export async function release(db: Db, reservationId: string, reason: string): Promise<void> {
  const reservation = await db.first<{ variantId: string; quantity: number; status: string }>(
    `SELECT "variantId", "quantity", "status" FROM "inventory_reservations" WHERE "id" = ?`,
    reservationId,
  );
  // Releasing something already released must not decrement twice.
  if (!reservation || !HOLDING_STATUSES.has(reservation.status)) return;

  await db.batch([
    db.statement(
      `UPDATE "inventory_reservations" SET "status" = 'CANCELLED', "cancelledReason" = ?, "updatedAt" = ? WHERE "id" = ? AND "status" IN ('ACTIVE','CHECKOUT_STARTED','PAYMENT_PROCESSING')`,
      reason,
      nowIso(),
      reservationId,
    ),
    db.statement(
      `UPDATE "inventory_balances"
          SET "reservedQuantity" = MAX(0, "reservedQuantity" - ?),
              "version" = "version" + 1,
              "updatedAt" = ?
        WHERE "variantId" = ?`,
      reservation.quantity,
      nowIso(),
      reservation.variantId,
    ),
  ]);
}

/** Reservation states that are currently holding stock. */
export const HOLDING_STATUSES = new Set(['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING']);

/**
 * Statements that turn a held reservation into a sale.
 *
 * Returned rather than executed so the caller can put them in the same D1
 * batch as the order rows: the stock movement and the order it belongs to
 * commit together or not at all.
 */
export function commitStatements(
  db: Db,
  input: {
    reservationId: string;
    variantId: string;
    quantity: number;
    orderId: string;
    orderNumber: string;
    previousOnHand: number;
  },
): D1PreparedStatement[] {
  const now = nowIso();
  return [
    db.statement(
      `UPDATE "inventory_balances"
          SET "onHandQuantity" = "onHandQuantity" - ?,
              "reservedQuantity" = MAX(0, "reservedQuantity" - ?),
              "soldQuantity" = "soldQuantity" + ?,
              "version" = "version" + 1,
              "updatedAt" = ?
        WHERE "variantId" = ?`,
      input.quantity,
      input.quantity,
      input.quantity,
      now,
      input.variantId,
    ),
    db.statement(
      `UPDATE "inventory_reservations"
          SET "status" = 'CONVERTED', "convertedAt" = ?, "orderId" = ?, "updatedAt" = ?
        WHERE "id" = ?`,
      now,
      input.orderId,
      now,
      input.reservationId,
    ),
    db.statement(
      `INSERT INTO "inventory_movements"
         ("id", "variantId", "type", "quantityChange", "previousOnHand", "newOnHand",
          "reason", "orderId", "createdAt")
       VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, ?)`,
      newId(),
      input.variantId,
      -input.quantity,
      input.previousOnHand,
      input.previousOnHand - input.quantity,
      `Order ${input.orderNumber}`,
      input.orderId,
      now,
    ),
  ];
}

/**
 * Releases every reservation whose window has closed.
 *
 * Runs on the Worker's cron trigger. Batched in chunks so one sweep cannot
 * exceed a Worker's subrequest budget on a busy database, and each chunk is
 * its own transaction — a partial sweep is fine, the next one finishes it.
 */
export async function expireStaleReservations(db: Db, limit = 200): Promise<number> {
  const expired = await db.all<{ id: string; variantId: string; quantity: number }>(
    `SELECT "id", "variantId", "quantity"
       FROM "inventory_reservations"
      WHERE "status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')
        AND "expiresAt" <= ?
      LIMIT ?`,
    nowIso(),
    limit,
  );
  if (expired.length === 0) return 0;

  const now = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const reservation of expired) {
    statements.push(
      db.statement(
        `UPDATE "inventory_reservations" SET "status" = 'EXPIRED', "updatedAt" = ? WHERE "id" = ? AND "status" IN ('ACTIVE','CHECKOUT_STARTED','PAYMENT_PROCESSING')`,
        now,
        reservation.id,
      ),
      db.statement(
        `UPDATE "inventory_balances"
            SET "reservedQuantity" = MAX(0, "reservedQuantity" - ?),
                "version" = "version" + 1,
                "updatedAt" = ?
          WHERE "variantId" = ?`,
        reservation.quantity,
        now,
        reservation.variantId,
      ),
      db.statement(
        `INSERT INTO "inventory_movements"
           ("id", "variantId", "type", "quantityChange", "previousOnHand", "newOnHand", "reason", "createdAt")
         SELECT ?, ?, 'RELEASE', 0, COALESCE("onHandQuantity", 0), COALESCE("onHandQuantity", 0),
                'Reservation expired', ?
           FROM "inventory_balances" WHERE "variantId" = ?`,
        newId(),
        reservation.variantId,
        now,
        reservation.variantId,
      ),
    );
  }

  await db.batch(statements);
  return expired.length;
}

/** Adjustment made by an administrator, with the ledger entry that records it. */
export async function adjustStock(
  db: Db,
  input: {
    variantId: string;
    newOnHand: number;
    reason: string;
    actorUserId: string;
    type?: 'RESTOCK' | 'ADJUSTMENT_INCREASE' | 'ADJUSTMENT_DECREASE' | 'CORRECTION' | 'DAMAGED';
  },
): Promise<{ previousOnHand: number; newOnHand: number }> {
  const balance = await db.first<{ onHandQuantity: number; reservedQuantity: number }>(
    `SELECT "onHandQuantity", "reservedQuantity" FROM "inventory_balances" WHERE "variantId" = ?`,
    input.variantId,
  );
  if (!balance) throw new ApiError('NOT_FOUND', 'That variant has no inventory record.');

  if (input.newOnHand < 0) {
    throw new ApiError('BAD_REQUEST', 'Stock cannot be negative.');
  }
  // Reserved units belong to shoppers who are mid-checkout. Letting an
  // administrator set on-hand below them would either strand those carts or
  // oversell, so the adjustment is refused with the number that would work.
  if (input.newOnHand < balance.reservedQuantity) {
    throw new ApiError(
      'CONFLICT',
      `${balance.reservedQuantity} unit(s) are currently reserved by shoppers, so stock cannot be set below that.`,
    );
  }

  const delta = input.newOnHand - balance.onHandQuantity;
  const type =
    input.type ?? (delta >= 0 ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE');

  await db.batch([
    db.statement(
      `UPDATE "inventory_balances"
          SET "onHandQuantity" = ?,
              "damagedQuantity" = "damagedQuantity" + ?,
              "version" = "version" + 1,
              "updatedAt" = ?
        WHERE "variantId" = ?`,
      input.newOnHand,
      type === 'DAMAGED' ? Math.abs(Math.min(0, delta)) : 0,
      nowIso(),
      input.variantId,
    ),
    db.statement(
      `INSERT INTO "inventory_movements"
         ("id", "variantId", "type", "quantityChange", "previousOnHand", "newOnHand",
          "reason", "actorUserId", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      input.variantId,
      type,
      delta,
      balance.onHandQuantity,
      input.newOnHand,
      input.reason,
      input.actorUserId,
      nowIso(),
    ),
  ]);

  return { previousOnHand: balance.onHandQuantity, newOnHand: input.newOnHand };
}
