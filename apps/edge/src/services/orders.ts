/**
 * Order reads, for customers and for the admin panel.
 *
 * Both go through `loadOrder`, which takes a viewer and refuses to return an
 * order that viewer is not entitled to. Making the entitlement part of the
 * loader — rather than a check each caller remembers to perform — is what keeps
 * `GET /account/orders/:id` from becoming an enumeration of everyone's orders.
 */

import type { OrderDto, OrderItemDto, Paginated } from '@outlet/types';
import { notFound } from '../lib/errors';
import { Db, allowListed, parseJson, type SqlValue } from '../lib/sql';

export interface OrderViewer {
  userId: string | null;
  /** True when the caller holds `orders.view`; lets them see any order. */
  isStaff: boolean;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  status: OrderDto['status'];
  currencyCode: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  couponCode: string | null;
  shippingAddress: string;
  billingAddress: string;
  shippingMethod: OrderDto['shippingMethod'];
  customerNote: string | null;
  internalNote: string | null;
  placedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

const ORDER_COLUMNS = `
  "id", "orderNumber", "userId", "email", "status", "currencyCode", "subtotalMinor",
  "discountMinor", "shippingMinor", "taxMinor", "totalMinor", "couponCode",
  "shippingAddress", "billingAddress", "shippingMethod", "customerNote", "internalNote",
  "placedAt", "paidAt", "cancelledAt", "cancelReason"`;

async function itemsFor(db: Db, orderIds: string[]): Promise<Map<string, OrderItemDto[]>> {
  const byOrder = new Map<string, OrderItemDto[]>();
  if (orderIds.length === 0) return byOrder;

  const rows = await db.all<{
    id: string;
    orderId: string;
    variantId: string | null;
    sku: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    originalUnitPriceMinor: number;
    totalMinor: number;
    returnedQuantity: number;
    productSnapshot: string;
  }>(
    `SELECT "id", "orderId", "variantId", "sku", "name", "quantity", "unitPriceMinor",
            "originalUnitPriceMinor", "totalMinor", "returnedQuantity", "productSnapshot"
       FROM "order_items"
      WHERE "orderId" IN (${orderIds.map(() => '?').join(', ')})
      ORDER BY "orderId", "id"`,
    ...orderIds,
  );

  for (const row of rows) {
    const snapshot = parseJson<Record<string, string | null>>(row.productSnapshot, {});
    const list = byOrder.get(row.orderId) ?? [];
    list.push({
      id: row.id,
      sku: row.sku,
      name: row.name,
      brandName: snapshot.brand ?? null,
      size: snapshot.size ?? null,
      color: snapshot.color ?? null,
      imageUrl: snapshot.imageUrl ?? null,
      quantity: row.quantity,
      unitPriceMinor: row.unitPriceMinor,
      totalMinor: row.totalMinor,
      returnedQuantity: row.returnedQuantity,
      // What is left to send back, computed here so the returns form cannot
      // be talked into accepting more than was bought.
      returnableQuantity: Math.max(0, row.quantity - row.returnedQuantity),
    });
    byOrder.set(row.orderId, list);
  }
  return byOrder;
}

/** Statuses a customer may still cancel from. After dispatch it is a return. */
const CANCELLABLE = new Set(['AWAITING_PAYMENT', 'PAID', 'PROCESSING']);

interface OrderRelations {
  payments: OrderDto['payments'];
  shipments: OrderDto['shipments'];
  timeline: OrderDto['timeline'];
}

function toDto(
  row: OrderRow,
  items: OrderItemDto[],
  viewer: OrderViewer,
  relations: OrderRelations,
): OrderDto & { customerNote: string | null; internalNote: string | null } {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    email: row.email,
    status: row.status,
    currencyCode: row.currencyCode,
    subtotalMinor: row.subtotalMinor,
    discountMinor: row.discountMinor,
    shippingMinor: row.shippingMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    couponCode: row.couponCode,
    shippingAddress: parseJson(row.shippingAddress, {} as OrderDto['shippingAddress']),
    billingAddress: parseJson(row.billingAddress, {} as OrderDto['billingAddress']),
    shippingMethod: row.shippingMethod,
    customerNote: row.customerNote,
    // Internal notes are staff-only. A customer reading their own order must
    // not receive the note an agent wrote about them.
    internalNote: viewer.isStaff ? row.internalNote : null,
    placedAt: row.placedAt,
    paidAt: row.paidAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    isCancellable: CANCELLABLE.has(row.status),
    createdAt: row.placedAt,
    items,
    ...relations,
  };
}

/**
 * Payments, shipments and the status timeline for a page of orders.
 *
 * Three queries for the whole page rather than three per order — the same
 * reason the catalogue listing batches its images.
 */
async function relationsFor(db: Db, orderIds: string[]): Promise<Map<string, OrderRelations>> {
  const byOrder = new Map<string, OrderRelations>();
  for (const id of orderIds) byOrder.set(id, { payments: [], shipments: [], timeline: [] });
  if (orderIds.length === 0) return byOrder;

  const placeholders = orderIds.map(() => '?').join(', ');
  const [payments, shipments, history] = await Promise.all([
    db.all<{
      orderId: string;
      id: string;
      provider: string;
      status: OrderDto['payments'][number]['status'];
      amountMinor: number;
      refundedAmountMinor: number;
      failureReason: string | null;
      createdAt: string;
    }>(
      `SELECT "orderId", "id", "provider", "status", "amountMinor", "refundedAmountMinor",
              "failureReason", "createdAt"
         FROM "payments" WHERE "orderId" IN (${placeholders}) ORDER BY "createdAt"`,
      ...orderIds,
    ),
    db.all<{
      orderId: string;
      id: string;
      carrier: string | null;
      trackingNumber: string | null;
      status: OrderDto['shipments'][number]['status'];
      shippedAt: string | null;
      deliveredAt: string | null;
    }>(
      `SELECT "orderId", "id", "carrier", "trackingNumber", "status", "shippedAt", "deliveredAt"
         FROM "shipments" WHERE "orderId" IN (${placeholders}) ORDER BY "createdAt"`,
      ...orderIds,
    ),
    db.all<{
      orderId: string;
      toStatus: OrderDto['status'];
      note: string | null;
      createdAt: string;
    }>(
      `SELECT "orderId", "toStatus", "note", "createdAt"
         FROM "order_status_history" WHERE "orderId" IN (${placeholders}) ORDER BY "createdAt", "id"`,
      ...orderIds,
    ),
  ]);

  const shipmentIds = shipments.map((shipment) => shipment.id);
  const events =
    shipmentIds.length > 0
      ? await db.all<{
          shipmentId: string;
          code: string;
          label: string;
          location: string | null;
          occurredAt: string;
        }>(
          `SELECT "shipmentId", "code", "label", "location", "occurredAt"
             FROM "shipment_events"
            WHERE "shipmentId" IN (${shipmentIds.map(() => '?').join(', ')})
            ORDER BY "occurredAt"`,
          ...shipmentIds,
        )
      : [];

  for (const payment of payments) {
    byOrder.get(payment.orderId)?.payments.push({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amountMinor: payment.amountMinor,
      refundedAmountMinor: payment.refundedAmountMinor,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
    });
  }
  for (const shipment of shipments) {
    byOrder.get(shipment.orderId)?.shipments.push({
      id: shipment.id,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
      events: events
        .filter((event) => event.shipmentId === shipment.id)
        .map(({ code, label, location, occurredAt }) => ({
          code,
          label,
          location,
          at: occurredAt,
        })),
    });
  }
  for (const entry of history) {
    byOrder.get(entry.orderId)?.timeline.push({
      status: entry.toStatus,
      at: entry.createdAt,
      note: entry.note,
    });
  }

  return byOrder;
}

/**
 * One order, or a 404.
 *
 * A customer asking for an order that exists but is not theirs gets exactly
 * the same answer as one asking for an order that does not exist — otherwise
 * the difference between the two responses is an oracle for which order ids
 * are real.
 */
export async function loadOrder(
  db: Db,
  viewer: OrderViewer,
  by: { id?: string; orderNumber?: string },
): Promise<OrderDto> {
  const row = by.orderNumber
    ? await db.first<OrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM "orders" WHERE "orderNumber" = ?`,
        by.orderNumber,
      )
    : await db.first<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM "orders" WHERE "id" = ?`, by.id ?? '');

  if (!row) throw notFound('Order not found.');
  if (!viewer.isStaff && (!viewer.userId || row.userId !== viewer.userId)) {
    throw notFound('Order not found.');
  }

  const [items, relations] = await Promise.all([
    itemsFor(db, [row.id]),
    relationsFor(db, [row.id]),
  ]);
  return toDto(row, items.get(row.id) ?? [], viewer, relations.get(row.id)!);
}

export async function listOrdersForCustomer(
  db: Db,
  userId: string,
  params: { page?: string; pageSize?: string },
): Promise<Paginated<OrderDto>> {
  const pageSize = Math.max(1, Math.min(50, Number(params.pageSize) || 20));
  const total = await db.count(`SELECT COUNT(*) AS "c" FROM "orders" WHERE "userId" = ?`, userId);
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(params.page) || 1), totalPages);

  const rows = await db.all<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM "orders" WHERE "userId" = ? ORDER BY "placedAt" DESC LIMIT ? OFFSET ?`,
    userId,
    pageSize,
    (page - 1) * pageSize,
  );

  const ids = rows.map((row) => row.id);
  const [items, relations] = await Promise.all([itemsFor(db, ids), relationsFor(db, ids)]);
  const viewer: OrderViewer = { userId, isStaff: false };
  return {
    items: rows.map((row) => toDto(row, items.get(row.id) ?? [], viewer, relations.get(row.id)!)),
    total,
    page,
    pageSize,
    totalPages,
  };
}

const ADMIN_ORDER_SORTS = {
  newest: `"placedAt" DESC`,
  oldest: `"placedAt" ASC`,
  total_desc: `"totalMinor" DESC`,
  total_asc: `"totalMinor" ASC`,
} as const;

export async function listOrdersForAdmin(
  db: Db,
  params: { q?: string; status?: string; page?: string; pageSize?: string; sort?: string },
): Promise<Paginated<OrderDto>> {
  const clauses: string[] = [];
  const bindings: SqlValue[] = [];

  if (params.status) {
    clauses.push(`"status" = ?`);
    bindings.push(params.status);
  }
  if (params.q) {
    // Order number or customer email — the two things a support agent has in
    // front of them when someone gets in touch.
    const needle = `%${params.q.trim().toLowerCase()}%`;
    clauses.push(`(LOWER("orderNumber") LIKE ? OR LOWER("email") LIKE ?)`);
    bindings.push(needle, needle);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 25));
  const total = await db.count(`SELECT COUNT(*) AS "c" FROM "orders" ${where}`, ...bindings);
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(params.page) || 1), totalPages);

  const rows = await db.all<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM "orders" ${where}
      ORDER BY ${allowListed(params.sort, ADMIN_ORDER_SORTS, 'newest')}
      LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );

  const ids = rows.map((row) => row.id);
  const [items, relations] = await Promise.all([itemsFor(db, ids), relationsFor(db, ids)]);
  const viewer: OrderViewer = { userId: null, isStaff: true };
  return {
    items: rows.map((row) => toDto(row, items.get(row.id) ?? [], viewer, relations.get(row.id)!)),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function orderTimeline(db: Db, orderId: string) {
  return db.all<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }>(
    `SELECT "id", "fromStatus", "toStatus", "note", "createdAt"
       FROM "order_status_history" WHERE "orderId" = ? ORDER BY "createdAt", "id"`,
    orderId,
  );
}

export async function paymentsForOrder(db: Db, orderId: string) {
  return db.all<{
    id: string;
    provider: string;
    status: string;
    amountMinor: number;
    refundedAmountMinor: number;
    currencyCode: string;
    createdAt: string;
  }>(
    `SELECT "id", "provider", "status", "amountMinor", "refundedAmountMinor", "currencyCode", "createdAt"
       FROM "payments" WHERE "orderId" = ? ORDER BY "createdAt"`,
    orderId,
  );
}

export async function shipmentsForOrder(db: Db, orderId: string) {
  const shipments = await db.all<{
    id: string;
    carrier: string | null;
    trackingNumber: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  }>(
    `SELECT "id", "carrier", "trackingNumber", "status", "shippedAt", "deliveredAt"
       FROM "shipments" WHERE "orderId" = ? ORDER BY "createdAt"`,
    orderId,
  );
  if (shipments.length === 0) return [];

  const events = await db.all<{
    shipmentId: string;
    code: string;
    label: string;
    location: string | null;
    occurredAt: string;
  }>(
    `SELECT "shipmentId", "code", "label", "location", "occurredAt"
       FROM "shipment_events"
      WHERE "shipmentId" IN (${shipments.map(() => '?').join(', ')})
      ORDER BY "occurredAt"`,
    ...shipments.map((s) => s.id),
  );

  return shipments.map((shipment) => ({
    ...shipment,
    events: events.filter((event) => event.shipmentId === shipment.id),
  }));
}

/**
 * The statuses an order may legally move to next.
 *
 * A state machine rather than a free-text field: without it, an admin panel
 * bug could move a delivered order back to awaiting-payment, and the order
 * history would stop meaning anything.
 */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['PARTIALLY_RETURNED', 'RETURNED', 'DELIVERED'],
  PARTIALLY_RETURNED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
};

export const canTransition = (from: string, to: string): boolean =>
  (ORDER_TRANSITIONS[from] ?? []).includes(to);
