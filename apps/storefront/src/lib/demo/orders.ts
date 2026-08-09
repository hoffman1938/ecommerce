/**
 * Demo checkout, orders and payments.
 *
 * Reproduces the observable behaviour of the real flow: a quote with shipping
 * options, an order placed against the cart's reserved lines, a redirect to the
 * mock payment page, and the four TEST-* outcomes resolving through a status
 * the result page polls. Paid orders consume stock from the seeded catalog, so
 * buying the last unit really does sell it out.
 *
 * Two honest simplifications, both because there is no server or worker:
 *  - Payment outcomes are applied locally rather than delivered as HMAC-signed
 *    webhooks. TEST-DELAYED stores a confirmation timestamp and settles the
 *    next time the status is read, which is what the polling UI observes.
 *  - Fulfilment advances on elapsed simulated time (see lifecycle.ts) rather
 *    than being driven by an operator in the admin panel, so returns are
 *    reachable in a couple of minutes — or instantly, via the QA console's
 *    time-travel controls.
 */

import type {
  CartDto,
  CheckoutQuoteDto,
  OrderDto,
  PaymentSessionDto,
  ShippingMethodDto,
} from '@outlet/types';
import { CURRENCY_CODE, SETTINGS } from './data';
import { clearCart, getCart } from './cart';
import {
  DemoApiError,
  currentUser,
  deliverEmail,
  mutate,
  newId,
  pushNotification,
  recordEvent,
  requireUser,
  simNow,
  type DemoOrder,
  type DemoPayment,
  type DemoState,
} from './store';
import {
  FULFILMENT_AFTER_SECONDS,
  FULFILMENT_SEQUENCE,
  ensureShipment,
  highestReachedStageIndex,
  isCancellable,
  restoreStock,
  syncShipmentScans,
  transitionOrder,
} from './lifecycle';

const SHIPPING_METHODS: ShippingMethodDto[] = [
  {
    id: 'STANDARD',
    label: 'Standard delivery',
    priceMinor: SETTINGS.standardShippingMinor,
    estimatedDays: '3-5 business days',
  },
  {
    id: 'EXPRESS',
    label: 'Express delivery',
    priceMinor: SETTINGS.expressShippingMinor,
    estimatedDays: '1-2 business days',
  },
];

const DELAYED_CONFIRMATION_MS = 10_000;

/**
 * Outcome code -> the reason the customer is shown. Mirrors the test cards in
 * lib/test-cards.ts; a code absent from here is a non-failure outcome.
 */
const FAILURE_REASONS: Record<string, string | undefined> = {
  'TEST-FAIL': 'The payment was declined by the test provider.',
  'TEST-DECLINED': 'Your bank declined the payment.',
  'TEST-INSUFFICIENT-FUNDS': 'The payment was declined for insufficient funds.',
  'TEST-EXPIRED-CARD': 'The card has expired.',
  'TEST-INVALID-CARD': 'The card details could not be processed.',
  'TEST-3DS-FAILED': '3-D Secure authentication was not completed.',
  'TEST-PROVIDER-UNAVAILABLE': 'The payment provider is temporarily unavailable.',
  'TEST-TIMEOUT': 'The payment request timed out before the provider responded.',
};

// --- Checkout --------------------------------------------------------------

export function startCheckout(): CheckoutQuoteDto {
  const cart = getCart();
  const live = cart.items.filter((item) => !item.isExpired);
  if (live.length === 0) {
    // 400 specifically: the checkout page treats that as "nothing to buy" and
    // redirects to the cart, which is the behaviour we want here.
    throw new DemoApiError(400, 'Your cart is empty.', 'CART_EMPTY');
  }

  const deadlines = live
    .map((item) => item.reservation?.expiresAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    cart,
    shippingMethods: SHIPPING_METHODS,
    reservationDeadline: deadlines[0] ?? null,
  };
}

export interface SubmitCheckoutBody {
  email: string;
  shippingAddress: Record<string, string>;
  billingAddress: Record<string, string>;
  shippingMethod: 'STANDARD' | 'EXPRESS';
  customerNote: string | null;
  expectedTotalMinor: number;
  idempotencyKey?: string;
}

function toStoredAddress(input: Record<string, unknown>): DemoOrder['shippingAddress'] {
  return {
    firstName: String(input?.firstName ?? '').trim(),
    lastName: String(input?.lastName ?? '').trim(),
    line1: String(input?.line1 ?? '').trim(),
    line2: input?.line2 ? String(input.line2).trim() : null,
    city: String(input?.city ?? '').trim(),
    region: input?.region ? String(input.region).trim() : null,
    postalCode: String(input?.postalCode ?? '').trim(),
    countryCode: String(input?.countryCode ?? '')
      .trim()
      .toUpperCase(),
    phone: input?.phone ? String(input.phone).trim() : null,
  };
}

function totalsFor(cart: CartDto, shippingMethod: string) {
  const discounted = cart.subtotalMinor - cart.discountMinor;
  const method = SHIPPING_METHODS.find((m) => m.id === shippingMethod) ?? SHIPPING_METHODS[0];
  const shippingMinor =
    shippingMethod === 'STANDARD' && discounted >= SETTINGS.freeShippingThresholdMinor
      ? 0
      : method.priceMinor;
  const totalMinor = discounted + shippingMinor;
  const taxMinor = Math.round((totalMinor * SETTINGS.taxRateBps) / (10_000 + SETTINGS.taxRateBps));
  return { shippingMinor, totalMinor, taxMinor };
}

export function submitCheckout(body: SubmitCheckoutBody): PaymentSessionDto {
  const cart = getCart();
  const live = cart.items.filter((item) => !item.isExpired);

  if (live.length === 0) {
    throw new DemoApiError(409, 'Your reservations expired.', 'RESERVATIONS_EXPIRED');
  }
  if (cart.items.some((item) => item.isExpired)) {
    throw new DemoApiError(409, 'Some reservations expired.', 'RESERVATIONS_EXPIRED');
  }

  const shippingMethod = body?.shippingMethod === 'EXPRESS' ? 'EXPRESS' : 'STANDARD';
  const { shippingMinor, totalMinor, taxMinor } = totalsFor(cart, shippingMethod);

  // Same guard the real API applies: refuse if the client's total is stale.
  if (typeof body?.expectedTotalMinor === 'number' && body.expectedTotalMinor !== totalMinor) {
    throw new DemoApiError(409, 'Prices changed while you were checking out.', 'TOTALS_CHANGED');
  }

  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase();
  if (!email.includes('@')) throw new DemoApiError(400, 'Enter a valid email address.');

  return mutate((state) => {
    // Idempotency: replaying a submit returns the original session.
    if (body?.idempotencyKey) {
      const existing = state.payments.find((p) => p.idempotencyKey === body.idempotencyKey);
      if (existing) return sessionFor(existing, state);
    }

    const user = currentUser(state);
    const orderNumber = `OUT-${state.orderSequence}`;
    state.orderSequence += 1;

    const now = new Date(simNow()).toISOString();
    const order: DemoOrder = {
      id: newId('order'),
      orderNumber,
      userId: user?.id ?? null,
      email,
      status: 'AWAITING_PAYMENT',
      currencyCode: CURRENCY_CODE,
      subtotalMinor: cart.subtotalMinor,
      discountMinor: cart.discountMinor,
      shippingMinor,
      taxMinor,
      totalMinor,
      couponCode: cart.couponCode,
      shippingAddress: toStoredAddress(body?.shippingAddress ?? {}),
      billingAddress: toStoredAddress(body?.billingAddress ?? body?.shippingAddress ?? {}),
      shippingMethod,
      customerNote: body?.customerNote ?? null,
      items: live.map((item) => ({
        id: newId('oi'),
        variantId: item.variantId,
        productSlug: item.productSlug,
        name: item.productName,
        sku: item.sku,
        brandName: item.brandName,
        size: item.size,
        color: item.color,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalMinor: item.lineTotalMinor,
        returnedQuantity: 0,
      })),
      placedAt: now,
      paidAt: null,
      createdAt: now,
      timeline: [{ status: 'AWAITING_PAYMENT', at: now, note: 'Order placed.' }],
      shipments: [],
      cancelledAt: null,
      cancelReason: null,
    };
    state.orders.push(order);

    recordEvent(state, {
      type: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: order.orderNumber,
      actor: 'customer',
      previousState: null,
      newState: 'AWAITING_PAYMENT',
      metadata: { totalMinor, itemCount: order.items.length },
    });

    const payment: DemoPayment = {
      id: newId('pay'),
      orderId: order.id,
      provider: 'mock',
      status: 'PENDING',
      amountMinor: totalMinor,
      refundedAmountMinor: 0,
      failureReason: null,
      idempotencyKey: body?.idempotencyKey ?? null,
      confirmAt: null,
      createdAt: now,
    };
    state.payments.push(payment);

    return sessionFor(payment, state);
  });
}

function sessionFor(payment: DemoPayment, state: DemoState): PaymentSessionDto {
  const order = state.orders.find((o) => o.id === payment.orderId)!;
  const returnUrl = `/checkout/result?orderId=${order.id}&paymentId=${payment.id}`;
  const query = new URLSearchParams({
    paymentId: payment.id,
    amount: String(payment.amountMinor),
    currency: order.currencyCode,
    orderNumber: order.orderNumber,
    returnUrl,
  });
  return {
    paymentId: payment.id,
    orderId: order.id,
    provider: 'mock',
    redirectUrl: `/checkout/mock-payment?${query.toString()}`,
    amountMinor: payment.amountMinor,
    currencyCode: order.currencyCode,
  };
}

// --- Payments --------------------------------------------------------------

export function simulatePayment(paymentId: string, body: { outcome: string }) {
  const outcome = String(body?.outcome ?? '');

  return mutate((state) => {
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new DemoApiError(404, 'Unknown payment reference.');
    const order = state.orders.find((o) => o.id === payment.orderId);
    if (!order) throw new DemoApiError(404, 'Unknown order.');

    // Failure outcomes differ only in the reason shown; treating them as one
    // branch keeps the retry behaviour identical across all of them.
    const failureReason = FAILURE_REASONS[outcome];
    if (failureReason) {
      markFailed(state, payment, order, failureReason);
      return { ok: true, status: payment.status };
    }

    switch (outcome) {
      case 'TEST-SUCCESS':
        markPaid(state, payment, order);
        break;
      case 'TEST-CANCEL':
        payment.status = 'CANCELLED';
        transitionOrder(state, order, 'CANCELLED', {
          note: 'Payment cancelled at the provider.',
          actor: 'customer',
        });
        order.cancelledAt = new Date(simNow()).toISOString();
        order.cancelReason = 'Payment cancelled';
        break;
      case 'TEST-DELAYED':
        payment.status = 'PROCESSING';
        payment.confirmAt = simNow() + DELAYED_CONFIRMATION_MS;
        break;
      default:
        throw new DemoApiError(400, `Unknown outcome ${outcome}.`);
    }
    return { ok: true, status: payment.status };
  });
}

function markPaid(state: DemoState, payment: DemoPayment, order: DemoOrder): void {
  if (payment.status === 'PAID') return;
  payment.status = 'PAID';
  payment.failureReason = null;
  order.paidAt = new Date(simNow()).toISOString();
  // Converting the reservation consumes real stock from the seeded catalog.
  for (const item of order.items) {
    state.stockConsumed[item.variantId] =
      (state.stockConsumed[item.variantId] ?? 0) + item.quantity;
  }
  recordEvent(state, {
    type: 'PAYMENT_SUCCEEDED',
    entityType: 'Payment',
    entityId: payment.id,
    actor: 'system',
    previousState: 'PENDING',
    newState: 'PAID',
    metadata: { orderNumber: order.orderNumber, amountMinor: payment.amountMinor },
  });
  transitionOrder(state, order, 'PAID', { note: 'Payment confirmed.' });
  clearCart();
}

/** Shared by every declined-payment path so the tester always sees the same UI. */
function markFailed(
  state: DemoState,
  payment: DemoPayment,
  order: DemoOrder,
  reason: string,
): void {
  payment.status = 'FAILED';
  payment.failureReason = reason;
  payment.confirmAt = null;
  // The order stays AWAITING_PAYMENT so the tester can retry rather than
  // having to rebuild the cart.
  recordEvent(state, {
    type: 'PAYMENT_FAILED',
    entityType: 'Payment',
    entityId: payment.id,
    actor: 'system',
    previousState: 'PENDING',
    newState: 'FAILED',
    metadata: { orderNumber: order.orderNumber, reason },
  });
  pushNotification(state, {
    userId: order.userId,
    type: 'payment.failed',
    title: `Payment failed — ${order.orderNumber}`,
    body: reason,
    orderNumber: order.orderNumber,
  });
  deliverEmail(state, {
    to: order.email,
    subject: `We could not take payment (${order.orderNumber})`,
    body: `${reason}\n\nYour order is still held. You can retry payment from your order page.`,
    template: 'payment_failed',
    orderNumber: order.orderNumber,
  });
}

/**
 * Settles any delayed payment whose timer has elapsed, and advances fulfilment
 * for paid orders. Called before every order read so the UI observes progress
 * without a worker process.
 */
function reconcile(state: DemoState): boolean {
  let changed = false;
  const now = simNow();

  for (const payment of state.payments) {
    if (payment.status !== 'PROCESSING' || !payment.confirmAt || now < payment.confirmAt) continue;
    const order = state.orders.find((o) => o.id === payment.orderId);
    if (!order) continue;
    payment.confirmAt = null;
    markPaid(state, payment, order);
    changed = true;
  }

  for (const order of state.orders) {
    if (!order.paidAt) continue;
    // Terminal or customer-driven states are never overwritten by the timer.
    if (
      ['CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'PARTIALLY_RETURNED'].includes(order.status)
    ) {
      continue;
    }

    const elapsed = (now - Date.parse(order.paidAt)) / 1000;

    // Advance only past stages already recorded. Walking the whole sequence
    // every time would re-apply stages the order has left behind.
    for (
      let index = highestReachedStageIndex(order) + 1;
      index < FULFILMENT_SEQUENCE.length;
      index += 1
    ) {
      const status = FULFILMENT_SEQUENCE[index];
      if (elapsed < FULFILMENT_AFTER_SECONDS[status]) break;
      const at = new Date(
        Date.parse(order.paidAt) + FULFILMENT_AFTER_SECONDS[status] * 1000,
      ).toISOString();
      if (transitionOrder(state, order, status, { at })) changed = true;

      if (status === 'SHIPPED') {
        const shipment = ensureShipment(state, order);
        if (!shipment.shippedAt) {
          shipment.shippedAt = at;
          shipment.status = 'SHIPPED';
          changed = true;
        }
      }
    }

    const shipment = order.shipments[0];
    if (shipment?.shippedAt) {
      const sinceShipped = (now - Date.parse(shipment.shippedAt)) / 1000;
      if (syncShipmentScans(state, order, shipment, sinceShipped)) changed = true;
    }
  }

  return changed;
}

// --- Customer-driven transitions -------------------------------------------

/** Cancel an order before it ships, releasing the stock it consumed. */
export function cancelOrder(orderId: string, reason?: string) {
  return mutate((state) => {
    const order = state.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) throw new DemoApiError(404, 'Order not found.');
    if (!isCancellable(order)) {
      throw new DemoApiError(
        409,
        `An order that is already ${order.status.toLowerCase()} can no longer be cancelled.`,
      );
    }

    if (order.paidAt) restoreStock(state, order);
    for (const payment of state.payments.filter((p) => p.orderId === order.id)) {
      if (payment.status === 'PAID') {
        payment.status = 'REFUNDED';
        payment.refundedAmountMinor = payment.amountMinor;
      } else if (payment.status !== 'FAILED') {
        payment.status = 'CANCELLED';
      }
    }

    order.cancelledAt = new Date(simNow()).toISOString();
    order.cancelReason = reason ?? 'Cancelled by customer';
    transitionOrder(state, order, 'CANCELLED', {
      note: order.cancelReason,
      actor: 'customer',
    });
    return toOrderDto(order, state);
  });
}

export function paymentStatus(paymentId: string) {
  return mutate((state) => {
    reconcile(state);
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new DemoApiError(404, 'Unknown payment reference.');
    const order = state.orders.find((o) => o.id === payment.orderId);
    if (!order) throw new DemoApiError(404, 'Unknown order.');
    return {
      payment: { id: payment.id, status: payment.status, amountMinor: payment.amountMinor },
      order: { orderNumber: order.orderNumber, status: order.status },
    };
  });
}

// --- Order reads -----------------------------------------------------------

function toOrderDto(order: DemoOrder, state: DemoState): OrderDto {
  const payments = state.payments.filter((p) => p.orderId === order.id);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status as OrderDto['status'],
    currencyCode: order.currencyCode,
    subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor,
    shippingMinor: order.shippingMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    couponCode: order.couponCode,
    email: order.email,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    shippingMethod: order.shippingMethod as OrderDto['shippingMethod'],
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      brandName: item.brandName,
      size: item.size,
      color: item.color,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.totalMinor,
      returnedQuantity: item.returnedQuantity,
      returnableQuantity: Math.max(0, item.quantity - item.returnedQuantity),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status as OrderDto['payments'][number]['status'],
      amountMinor: p.amountMinor,
      refundedAmountMinor: p.refundedAmountMinor,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
    })),
    shipments: order.shipments.map((s) => ({
      id: s.id,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      status: s.status as OrderDto['shipments'][number]['status'],
      shippedAt: s.shippedAt,
      deliveredAt: s.deliveredAt,
      events: s.events,
    })),
    timeline: order.timeline.map((entry) => ({
      status: entry.status as OrderDto['status'],
      at: entry.at,
      note: entry.note,
    })),
    placedAt: order.placedAt,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    isCancellable: isCancellable(order),
    createdAt: order.createdAt,
  };
}

export function listOrders(): OrderDto[] {
  return mutate((state) => {
    const user = requireUser(state);
    reconcile(state);
    return state.orders
      .filter((order) => order.userId === user.id)
      .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
      .map((order) => toOrderDto(order, state));
  });
}

export function orderById(orderId: string): OrderDto {
  return mutate((state) => {
    reconcile(state);
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new DemoApiError(404, 'That order does not exist.');
    const user = currentUser(state);
    // Guest orders stay reachable via the checkout result link they were given.
    if (order.userId && order.userId !== user?.id) {
      throw new DemoApiError(403, 'That order belongs to a different account.');
    }
    return toOrderDto(order, state);
  });
}
