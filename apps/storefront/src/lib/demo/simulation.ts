/**
 * QA simulation controls.
 *
 * Everything a tester needs to drive the sandbox into a specific state without
 * waiting: force order transitions, travel forward in time, adjust stock, and
 * wipe the environment back to seed.
 *
 * These are deliberately *not* wired into the customer UI. They exist behind
 * /qa, which the demo banner links to, and every one of them is a local
 * localStorage mutation — no request leaves the browser, and nothing here has
 * an equivalent in the production API surface.
 */

import {
  FULFILMENT_AFTER_SECONDS,
  FULFILMENT_SEQUENCE,
  SHIPMENT_SCANS,
  ensureShipment,
  highestReachedStageIndex,
  restoreStock,
  transitionOrder,
} from './lifecycle';
import { availableFor } from './queries';
import { productBySlug, productList } from './data';
import {
  DemoApiError,
  advanceClock,
  deliverEmail,
  mutate,
  pushNotification,
  readState,
  recordEvent,
  resetClock,
  simNow,
  writeState,
  type DemoOrder,
  type DemoState,
} from './store';

export interface SimulationStatusDto {
  clockOffsetMs: number;
  simulatedNow: string;
  realNow: string;
  orderCount: number;
  eventCount: number;
  notificationCount: number;
  emailCount: number;
  signedInAs: string | null;
}

export function simulationStatus(): SimulationStatusDto {
  const state = readState();
  const user = state.users.find((u) => u.id === state.sessionUserId) ?? null;
  return {
    clockOffsetMs: state.clockOffsetMs,
    simulatedNow: new Date(Date.now() + state.clockOffsetMs).toISOString(),
    realNow: new Date().toISOString(),
    orderCount: state.orders.length,
    eventCount: state.events.length,
    notificationCount: state.notifications.length,
    emailCount: state.emails.length,
    signedInAs: user?.email ?? null,
  };
}

// --- Time travel ------------------------------------------------------------

const JUMPS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export function travel(amount: string): SimulationStatusDto {
  const ms = JUMPS[amount];
  if (!ms) throw new DemoApiError(400, `Unknown time jump "${amount}".`);
  advanceClock(ms);
  recordSimEvent('CLOCK_ADVANCED', 'Clock', amount, { ms });
  return simulationStatus();
}

export function resetTime(): SimulationStatusDto {
  resetClock();
  recordSimEvent('CLOCK_RESET', 'Clock', 'now', null);
  return simulationStatus();
}

// --- Order controls ---------------------------------------------------------

function findOrder(state: DemoState, ref: string): DemoOrder {
  const order = state.orders.find((o) => o.id === ref || o.orderNumber === ref);
  if (!order) throw new DemoApiError(404, `No order matching "${ref}".`);
  return order;
}

/**
 * Push an order to its next fulfilment stage immediately, regardless of the
 * timer. Backdates `paidAt` so the timer agrees with the forced state instead
 * of dragging the order back on the next read.
 */
export function advanceOrder(ref: string): { orderNumber: string; status: string } {
  return mutate((state) => {
    const order = findOrder(state, ref);
    if (!order.paidAt) {
      throw new DemoApiError(409, 'Only a paid order can be advanced.');
    }
    const next = FULFILMENT_SEQUENCE[highestReachedStageIndex(order) + 1];
    if (!next) throw new DemoApiError(409, `${order.orderNumber} is already delivered.`);

    return applyOrderStage(state, order, next);
  });
}

/** Jump an order straight to a chosen stage, applying every stage in between. */
export function setOrderStage(
  ref: string,
  target: string,
): { orderNumber: string; status: string } {
  return mutate((state) => {
    const order = findOrder(state, ref);
    const targetIndex = FULFILMENT_SEQUENCE.indexOf(target as (typeof FULFILMENT_SEQUENCE)[number]);
    if (targetIndex === -1) throw new DemoApiError(400, `Unknown stage "${target}".`);
    if (!order.paidAt) throw new DemoApiError(409, 'Only a paid order can be advanced.');

    // Only apply stages the order has not already been through, so jumping to
    // a stage it has passed is a no-op rather than a second round of emails.
    let result = { orderNumber: order.orderNumber, status: order.status };
    const from = highestReachedStageIndex(order) + 1;
    for (const stage of FULFILMENT_SEQUENCE.slice(from, targetIndex + 1)) {
      result = applyOrderStage(state, order, stage);
    }
    return result;
  });
}

/**
 * Apply one stage and keep `paidAt` consistent with it, so `reconcile()` does
 * not immediately undo a forced transition.
 */
function applyOrderStage(
  state: DemoState,
  order: DemoOrder,
  stage: (typeof FULFILMENT_SEQUENCE)[number],
): { orderNumber: string; status: string } {
  const now = simNow();
  const backdated = now - FULFILMENT_AFTER_SECONDS[stage] * 1000;
  if (order.paidAt && Date.parse(order.paidAt) > backdated) {
    order.paidAt = new Date(backdated).toISOString();
  }

  transitionOrder(state, order, stage, { note: 'Forced from the QA console.', actor: 'qa' });

  if (stage === 'SHIPPED' || stage === 'DELIVERED') {
    const shipment = ensureShipment(state, order);
    if (!shipment.shippedAt) {
      shipment.shippedAt = new Date(now).toISOString();
      shipment.status = 'SHIPPED';
    }
  }
  if (stage === 'DELIVERED') {
    const shipment = order.shipments[0];
    if (shipment) {
      // A delivered order must show a complete scan history, so fill in any
      // scans the accelerated timeline skipped.
      const shippedAtMs = Date.parse(shipment.shippedAt!);
      for (const scan of SHIPMENT_SCANS) {
        if (shipment.events.some((event) => event.code === scan.code)) continue;
        shipment.events.push({
          code: scan.code,
          label: scan.label,
          at: new Date(shippedAtMs + scan.afterSeconds * 1000).toISOString(),
          location: scan.location,
        });
      }
      shipment.status = 'DELIVERED';
      shipment.deliveredAt = new Date(now).toISOString();
    }
  }

  return { orderNumber: order.orderNumber, status: order.status };
}

/** Simulate a failed delivery attempt; the parcel goes back out for delivery. */
export function failDelivery(ref: string): { orderNumber: string; status: string } {
  return mutate((state) => {
    const order = findOrder(state, ref);
    const shipment = order.shipments[0];
    if (!shipment?.shippedAt) {
      throw new DemoApiError(409, 'That order has not shipped yet.');
    }
    if (shipment.status === 'DELIVERED') {
      throw new DemoApiError(409, 'That parcel has already been delivered.');
    }

    const at = new Date(simNow()).toISOString();
    shipment.events.push({
      code: 'DELIVERY_FAILED',
      label: 'Delivery attempt failed — nobody home',
      at,
      location: 'Delivery address',
    });
    shipment.events.push({
      code: 'OUT_FOR_DELIVERY',
      label: 'Out for delivery (retry)',
      at,
      location: 'Local depot',
    });

    recordEvent(state, {
      type: 'DELIVERY_FAILED',
      entityType: 'Shipment',
      entityId: shipment.trackingNumber ?? shipment.id,
      actor: 'qa',
      previousState: 'OUT_FOR_DELIVERY',
      newState: 'OUT_FOR_DELIVERY',
      metadata: { orderNumber: order.orderNumber },
    });

    return { orderNumber: order.orderNumber, status: order.status };
  });
}

// --- Return & refund controls -----------------------------------------------

/** The states a return walks through, in order. */
export const RETURN_SEQUENCE = ['REQUESTED', 'APPROVED', 'RECEIVED', 'COMPLETED'] as const;

export const RETURN_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Under review',
  APPROVED: 'Approved — in transit back to us',
  RECEIVED: 'Received and inspected',
  COMPLETED: 'Refunded',
  REJECTED: 'Rejected',
};

export interface ReturnRowDto {
  id: string;
  rmaNumber: string;
  orderNumber: string;
  status: string;
  itemCount: number;
  refundMinor: number;
}

export function listReturnsForQa(): ReturnRowDto[] {
  const state = readState();
  return state.returns.map((request) => {
    const order = state.orders.find((o) => o.id === request.orderId);
    return {
      id: request.id,
      rmaNumber: request.rmaNumber,
      orderNumber: order?.orderNumber ?? '—',
      status: request.status,
      itemCount: request.items.reduce((sum, item) => sum + item.quantity, 0),
      refundMinor: refundableFor(state, request.id),
    };
  });
}

/** What the return is worth, from the order lines it covers. */
function refundableFor(state: DemoState, returnId: string): number {
  const request = state.returns.find((r) => r.id === returnId);
  if (!request) return 0;
  const order = state.orders.find((o) => o.id === request.orderId);
  if (!order) return 0;
  return request.items.reduce((sum, item) => {
    const orderItem = order.items.find((i) => i.id === item.orderItemId);
    return sum + (orderItem ? orderItem.unitPriceMinor * item.quantity : 0);
  }, 0);
}

/**
 * Advance a return one step. The refund, the restock and the order's own status
 * only happen at COMPLETED — that is the point at which a real business has
 * inspected the goods and is willing to give the money back.
 */
export function advanceReturn(ref: string): { rmaNumber: string; status: string } {
  return mutate((state) => {
    const request = state.returns.find((r) => r.id === ref || r.rmaNumber === ref);
    if (!request) throw new DemoApiError(404, `No return matching "${ref}".`);

    const index = RETURN_SEQUENCE.indexOf(request.status as (typeof RETURN_SEQUENCE)[number]);
    const next = RETURN_SEQUENCE[index + 1];
    if (!next) throw new DemoApiError(409, `${request.rmaNumber} is already refunded.`);

    return applyReturnStatus(state, request.id, next);
  });
}

export function rejectReturn(ref: string): { rmaNumber: string; status: string } {
  return mutate((state) => {
    const request = state.returns.find((r) => r.id === ref || r.rmaNumber === ref);
    if (!request) throw new DemoApiError(404, `No return matching "${ref}".`);
    if (request.status === 'COMPLETED') {
      throw new DemoApiError(409, 'That return has already been refunded.');
    }
    return applyReturnStatus(state, request.id, 'REJECTED');
  });
}

function applyReturnStatus(
  state: DemoState,
  returnId: string,
  status: string,
): { rmaNumber: string; status: string } {
  const request = state.returns.find((r) => r.id === returnId)!;
  const order = state.orders.find((o) => o.id === request.orderId);
  const previous = request.status;
  const at = new Date(simNow()).toISOString();

  request.status = status;

  if (status === 'RECEIVED') {
    for (const item of request.items) {
      item.receivedQuantity = item.quantity;
      item.condition = 'RESELLABLE';
    }
  }

  if (status === 'COMPLETED' && order) {
    const refundMinor = refundableFor(state, returnId);

    for (const item of request.items) {
      item.restockedQuantity = item.quantity;
      const orderItem = order.items.find((i) => i.id === item.orderItemId);
      if (!orderItem) continue;
      orderItem.returnedQuantity += item.quantity;
      // Returned stock goes back on the shelf, as RETURN_RESTOCK does for real.
      const consumed = state.stockConsumed[orderItem.variantId] ?? 0;
      state.stockConsumed[orderItem.variantId] = Math.max(0, consumed - item.quantity);
    }

    request.refunds.push({
      id: `SIM-REF-${new Date(simNow()).getUTCFullYear()}-${String(state.returns.length).padStart(5, '0')}`,
      amountMinor: refundMinor,
      status: 'SUCCEEDED',
      reason: 'Return accepted',
      createdAt: at,
    });

    const payment = state.payments.find((p) => p.orderId === order.id && p.status !== 'FAILED');
    if (payment) {
      payment.refundedAmountMinor += refundMinor;
      payment.status =
        payment.refundedAmountMinor >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }

    const fullyReturned = order.items.every((i) => i.returnedQuantity >= i.quantity);
    transitionOrder(state, order, fullyReturned ? 'RETURNED' : 'PARTIALLY_RETURNED', {
      note: `Return ${request.rmaNumber} refunded.`,
      actor: 'qa',
    });

    pushNotification(state, {
      userId: request.userId,
      type: 'refund.succeeded',
      title: `Refund issued — ${request.rmaNumber}`,
      body: 'Your refund has been issued to the original payment method.',
      orderNumber: order.orderNumber,
    });
    deliverEmail(state, {
      to: order.email,
      subject: `Your refund has been issued (${request.rmaNumber})`,
      body: 'We have inspected your return and issued a refund to your original payment method. It can take 5-10 business days to appear.',
      template: 'refund_succeeded',
      orderNumber: order.orderNumber,
    });
  } else if (order) {
    pushNotification(state, {
      userId: request.userId,
      type: `return.${status.toLowerCase()}`,
      title: `Return ${request.rmaNumber} — ${RETURN_STATUS_LABELS[status] ?? status}`,
      body:
        status === 'REJECTED'
          ? 'We could not accept this return. Contact support if you think this is wrong.'
          : 'Your return has moved to the next stage.',
      orderNumber: order.orderNumber,
    });
  }

  recordEvent(state, {
    type: 'RETURN_STATUS_CHANGED',
    entityType: 'ReturnRequest',
    entityId: request.rmaNumber,
    actor: 'qa',
    previousState: previous,
    newState: status,
    metadata: order ? { orderNumber: order.orderNumber } : null,
  });

  return { rmaNumber: request.rmaNumber, status };
}

// --- Inventory controls -----------------------------------------------------

export interface InventoryRowDto {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  size: string;
  color: string;
  seeded: number;
  consumed: number;
  available: number;
}

export function listInventory(slug?: string): InventoryRowDto[] {
  const state = readState();
  const products = slug ? [productBySlug(slug)].filter(Boolean) : productList().slice(0, 12);

  return products.flatMap((product) =>
    product!.variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      productSlug: product!.slug,
      productName: product!.name,
      size: variant.size,
      color: variant.color,
      seeded: variant.onHandQuantity,
      consumed: state.stockConsumed[variant.id] ?? 0,
      available: availableFor(variant),
    })),
  );
}

/**
 * Set a variant's available units.
 *
 * Seeded stock is a constant, so availability is steered through the
 * `stockConsumed` ledger: consuming more lowers it, consuming less raises it.
 * That keeps one source of truth rather than introducing a second override.
 */
export function setStock(variantId: string, available: number): InventoryRowDto {
  return mutate((state) => {
    const product = productList().find((p) => p.variants.some((v) => v.id === variantId));
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) throw new DemoApiError(404, 'Unknown variant.');

    const target = Math.max(0, Math.min(variant.onHandQuantity, Math.floor(available)));
    const previous = variant.onHandQuantity - (state.stockConsumed[variantId] ?? 0);
    state.stockConsumed[variantId] = variant.onHandQuantity - target;

    recordEvent(state, {
      type: 'INVENTORY_ADJUSTED',
      entityType: 'ProductVariant',
      entityId: variant.sku,
      actor: 'qa',
      previousState: String(previous),
      newState: String(target),
      metadata: { productSlug: product.slug },
    });

    return {
      variantId,
      sku: variant.sku,
      productSlug: product.slug,
      productName: product.name,
      size: variant.size,
      color: variant.color,
      seeded: variant.onHandQuantity,
      consumed: state.stockConsumed[variantId],
      available: target,
    };
  });
}

// --- Environment reset ------------------------------------------------------

export type ResetTarget = 'all' | 'orders' | 'inventory' | 'inbox' | 'events' | 'cart' | 'wishlist';

/**
 * Wipe part of the sandbox. `all` clears the localStorage record entirely,
 * which is the only reset guaranteed to leave no residue from an older shape.
 */
export function resetSimulation(target: ResetTarget = 'all'): { ok: true; target: ResetTarget } {
  if (target === 'all') {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('outlet_demo_state');
      window.localStorage.removeItem('outlet_demo_cart');
    }
    return { ok: true, target };
  }

  if (target === 'cart') {
    if (typeof window !== 'undefined') window.localStorage.removeItem('outlet_demo_cart');
    return { ok: true, target };
  }

  const state = readState();
  switch (target) {
    case 'orders':
      // Orders own the consumed stock, so clearing them must give it back.
      state.orders = [];
      state.payments = [];
      state.returns = [];
      state.stockConsumed = {};
      break;
    case 'inventory':
      state.stockConsumed = {};
      break;
    case 'inbox':
      state.notifications = [];
      state.emails = [];
      break;
    case 'events':
      state.events = [];
      break;
    case 'wishlist':
      state.wishlist = [];
      break;
  }
  recordEvent(state, {
    type: 'SIMULATION_RESET',
    entityType: 'Simulation',
    entityId: target,
    actor: 'qa',
    previousState: null,
    newState: null,
    metadata: null,
  });
  writeState(state);
  return { ok: true, target };
}

/** Cancel an order from the QA console, restoring its stock. */
export function qaCancelOrder(ref: string): { orderNumber: string; status: string } {
  return mutate((state) => {
    const order = findOrder(state, ref);
    if (order.status === 'CANCELLED') {
      throw new DemoApiError(409, 'That order is already cancelled.');
    }
    if (order.paidAt) restoreStock(state, order);
    order.cancelledAt = new Date(simNow()).toISOString();
    order.cancelReason = 'Cancelled from the QA console';
    transitionOrder(state, order, 'CANCELLED', {
      note: order.cancelReason,
      actor: 'qa',
    });
    return { orderNumber: order.orderNumber, status: order.status };
  });
}

function recordSimEvent(
  type: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> | null,
): void {
  mutate((state) => {
    recordEvent(state, {
      type,
      entityType,
      entityId,
      actor: 'qa',
      previousState: null,
      newState: null,
      metadata,
    });
  });
}
