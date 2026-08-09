/**
 * Simulated order and shipment lifecycle.
 *
 * One place decides what happens when an order changes state, so a transition
 * driven by the fulfilment timer, by the QA console, or by a cancellation all
 * produce the same timeline entry, audit event, notification and email. Wiring
 * those four things at each call site is how they drift apart.
 *
 * Order status uses the real `OrderStatus` enum — no invented values — because
 * the DTOs and the admin panel are typed against it. The finer-grained stages
 * the brief asks for ("In Transit", "Out for Delivery") belong to the shipment,
 * not the order, and live in the carrier scan history.
 */

import { CANCELLABLE_ORDER_STATUSES } from '@outlet/domain';
import {
  deliverEmail,
  newId,
  pushNotification,
  recordEvent,
  type DemoOrder,
  type DemoShipment,
  type DemoState,
} from './store';

/** Order statuses a paid order walks through, in order. */
export const FULFILMENT_SEQUENCE = [
  'PAID',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
] as const;

export type FulfilmentStatus = (typeof FULFILMENT_SEQUENCE)[number];

/**
 * Seconds after payment at which each stage is reached. Deliberately short:
 * a tester should be able to reach a returnable order in a couple of minutes,
 * and the QA console's time travel collapses even that.
 */
export const FULFILMENT_AFTER_SECONDS: Record<FulfilmentStatus, number> = {
  PAID: 0,
  PROCESSING: 25,
  PACKED: 60,
  SHIPPED: 110,
  DELIVERED: 260,
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: 'Pending payment',
  PAID: 'Payment confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  PARTIALLY_RETURNED: 'Partially returned',
  RETURNED: 'Returned',
};

/** Carrier scan codes, in the order a parcel collects them. */
export const SHIPMENT_SCANS = [
  { code: 'PREPARED', label: 'Package prepared', afterSeconds: 0, location: 'Tbilisi hub' },
  {
    code: 'HANDED_OVER',
    label: 'Handed to carrier',
    afterSeconds: 15,
    location: 'Tbilisi hub',
  },
  { code: 'IN_TRANSIT', label: 'In transit', afterSeconds: 45, location: 'In transit' },
  {
    code: 'AT_DESTINATION',
    label: 'Arrived at destination facility',
    afterSeconds: 95,
    location: 'Destination facility',
  },
  {
    code: 'OUT_FOR_DELIVERY',
    label: 'Out for delivery',
    afterSeconds: 125,
    location: 'Local depot',
  },
  { code: 'DELIVERED', label: 'Delivered', afterSeconds: 150, location: 'Delivery address' },
] as const;

const MESSAGES: Record<
  string,
  { title: string; body: string; subject: string; email: string } | undefined
> = {
  PAID: {
    title: 'Payment confirmed',
    body: 'We have received your payment and your order is confirmed.',
    subject: 'Your payment was received',
    email:
      'Thanks — your payment has cleared and we are preparing your order. You will hear from us again when it ships.',
  },
  PROCESSING: {
    title: 'Order is being prepared',
    body: 'Our warehouse has started picking your items.',
    subject: 'We are preparing your order',
    email:
      'Your order is being picked in our warehouse. Nothing for you to do — we will confirm when it is on its way.',
  },
  PACKED: {
    title: 'Order packed',
    body: 'Your parcel is packed and waiting for the carrier.',
    subject: 'Your order is packed',
    email: 'Your parcel is packed and waiting for collection by the carrier.',
  },
  SHIPPED: {
    title: 'Order shipped',
    body: 'Your parcel is on its way. Track it from your order page.',
    subject: 'Your order has shipped',
    email:
      'Good news — your parcel is on its way. You can follow it from the tracking timeline on your order page.',
  },
  DELIVERED: {
    title: 'Order delivered',
    body: 'Your parcel has been delivered. You have 30 days to request a return.',
    subject: 'Your order was delivered',
    email:
      'Your parcel has been delivered. If anything is not right, you can request a return from your order page within 30 days.',
  },
  CANCELLED: {
    title: 'Order cancelled',
    body: 'Your order was cancelled and any reserved stock has been released.',
    subject: 'Your order was cancelled',
    email:
      'Your order has been cancelled. No payment will be taken, and any stock we were holding has been released.',
  },
};

function nowIso(state: DemoState): string {
  return new Date(Date.now() + state.clockOffsetMs).toISOString();
}

/**
 * Move an order to a new status and fan out every consequence: timeline entry,
 * audit event, in-app notification and simulated email.
 *
 * Returns false when the order is already in that status, so callers can drive
 * this from a timer without producing duplicate notifications.
 */
export function transitionOrder(
  state: DemoState,
  order: DemoOrder,
  status: string,
  options: { note?: string | null; actor?: 'system' | 'customer' | 'qa'; at?: string } = {},
): boolean {
  if (order.status === status) return false;

  const previous = order.status;
  const at = options.at ?? nowIso(state);
  const actor = options.actor ?? 'system';

  order.status = status;
  order.timeline.push({ status, at, note: options.note ?? null });

  recordEvent(state, {
    type: 'ORDER_STATUS_CHANGED',
    entityType: 'Order',
    entityId: order.orderNumber,
    actor,
    previousState: previous,
    newState: status,
    metadata: options.note ? { note: options.note } : null,
    at,
  });

  const message = MESSAGES[status];
  if (message) {
    pushNotification(state, {
      userId: order.userId,
      type: `order.${status.toLowerCase()}`,
      title: `${message.title} — ${order.orderNumber}`,
      body: message.body,
      orderNumber: order.orderNumber,
    });
    deliverEmail(state, {
      to: order.email,
      subject: `${message.subject} (${order.orderNumber})`,
      body: message.email,
      template: `order_${status.toLowerCase()}`,
      orderNumber: order.orderNumber,
    });
  }

  return true;
}

/**
 * Index of the furthest fulfilment stage the order has already recorded, or -1.
 *
 * Callers must advance from here rather than from `order.status`: an order that
 * has reached DELIVERED still differs from PAID, so a loop guarded only by the
 * current status happily walks it backwards and re-fires every notification on
 * every read.
 */
export function highestReachedStageIndex(order: DemoOrder): number {
  let highest = -1;
  FULFILMENT_SEQUENCE.forEach((status, index) => {
    if (order.timeline.some((entry) => entry.status === status)) highest = index;
  });
  return highest;
}

/** Creates the shipment record the moment an order first ships. */
export function ensureShipment(state: DemoState, order: DemoOrder): DemoShipment {
  const existing = order.shipments[0];
  if (existing) return existing;

  const shipment: DemoShipment = {
    id: newId('shp'),
    carrier: 'Simulated Carrier',
    // Clearly fictional so it can never be mistaken for a real consignment.
    trackingNumber: `SIM-GEO-${order.orderNumber.replace(/\D/g, '')}`,
    status: 'PENDING',
    shippedAt: null,
    deliveredAt: null,
    events: [],
  };
  order.shipments.push(shipment);

  recordEvent(state, {
    type: 'SHIPMENT_CREATED',
    entityType: 'Shipment',
    entityId: shipment.trackingNumber!,
    actor: 'system',
    previousState: null,
    newState: 'PENDING',
    metadata: { orderNumber: order.orderNumber },
  });

  return shipment;
}

/** Append carrier scans up to `elapsedSeconds` since the parcel shipped. */
export function syncShipmentScans(
  state: DemoState,
  order: DemoOrder,
  shipment: DemoShipment,
  elapsedSeconds: number,
): boolean {
  if (!shipment.shippedAt) return false;
  const shippedAtMs = Date.parse(shipment.shippedAt);
  let changed = false;

  for (const scan of SHIPMENT_SCANS) {
    if (elapsedSeconds < scan.afterSeconds) break;
    if (shipment.events.some((event) => event.code === scan.code)) continue;

    shipment.events.push({
      code: scan.code,
      label: scan.label,
      at: new Date(shippedAtMs + scan.afterSeconds * 1000).toISOString(),
      location: scan.location,
    });
    changed = true;

    if (scan.code === 'DELIVERED') {
      shipment.status = 'DELIVERED';
      shipment.deliveredAt = new Date(shippedAtMs + scan.afterSeconds * 1000).toISOString();
    } else {
      shipment.status = 'SHIPPED';
    }
  }

  return changed;
}

/** Restores stock consumed by an order — used on cancellation and on refund. */
export function restoreStock(state: DemoState, order: DemoOrder): void {
  for (const item of order.items) {
    const consumed = state.stockConsumed[item.variantId] ?? 0;
    state.stockConsumed[item.variantId] = Math.max(0, consumed - item.quantity);
  }
  recordEvent(state, {
    type: 'INVENTORY_RESTORED',
    entityType: 'Order',
    entityId: order.orderNumber,
    actor: 'system',
    previousState: null,
    newState: null,
    metadata: { items: order.items.length },
  });
}

/**
 * Statuses from which a customer may still cancel. Reuses the domain list so
 * the sandbox and the real API cannot disagree about what is cancellable.
 */
export function isCancellable(order: DemoOrder): boolean {
  return (CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(order.status);
}
