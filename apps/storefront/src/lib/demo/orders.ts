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
 *  - Fulfilment advances on elapsed time (see FULFILMENT_STEPS) instead of
 *    being driven by an operator in the admin panel, so returns are reachable
 *    in about a minute rather than never.
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
  mutate,
  newId,
  requireUser,
  type DemoOrder,
  type DemoPayment,
  type DemoState,
} from './store';

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

/** Seconds after payment at which an order reaches each state. */
const FULFILMENT_STEPS = { shipped: 20, delivered: 45 };

const DELAYED_CONFIRMATION_MS = 10_000;

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

    const now = new Date().toISOString();
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
      shipments: [],
    };
    state.orders.push(order);

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

    switch (outcome) {
      case 'TEST-SUCCESS':
        markPaid(state, payment, order);
        break;
      case 'TEST-FAIL':
        payment.status = 'FAILED';
        payment.failureReason = 'The payment was declined by the test provider.';
        order.status = 'AWAITING_PAYMENT';
        break;
      case 'TEST-CANCEL':
        payment.status = 'CANCELLED';
        order.status = 'CANCELLED';
        break;
      case 'TEST-DELAYED':
        payment.status = 'PROCESSING';
        payment.confirmAt = Date.now() + DELAYED_CONFIRMATION_MS;
        order.status = 'AWAITING_PAYMENT';
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
  order.status = 'PAID';
  order.paidAt = new Date().toISOString();
  // Converting the reservation consumes real stock from the seeded catalog.
  for (const item of order.items) {
    state.stockConsumed[item.variantId] =
      (state.stockConsumed[item.variantId] ?? 0) + item.quantity;
  }
  clearCart();
}

/**
 * Settles any delayed payment whose timer has elapsed, and advances fulfilment
 * for paid orders. Called before every order read so the UI observes progress
 * without a worker process.
 */
function reconcile(state: DemoState): boolean {
  let changed = false;
  const now = Date.now();

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
    if (['CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED'].includes(order.status)) continue;
    const elapsed = (now - Date.parse(order.paidAt)) / 1000;
    const next =
      elapsed >= FULFILMENT_STEPS.delivered
        ? 'DELIVERED'
        : elapsed >= FULFILMENT_STEPS.shipped
          ? 'SHIPPED'
          : 'PROCESSING';
    if (order.status !== next) {
      order.status = next;
      changed = true;
    }
    if (next !== 'PROCESSING' && order.shipments.length === 0) {
      order.shipments.push({
        id: newId('shp'),
        carrier: 'Demo Logistics',
        trackingNumber: `TRK-${order.orderNumber}`,
        status: 'SHIPPED',
        shippedAt: new Date(
          Date.parse(order.paidAt) + FULFILMENT_STEPS.shipped * 1000,
        ).toISOString(),
        deliveredAt: null,
      });
      changed = true;
    }
    const shipment = order.shipments[0];
    if (shipment && next === 'DELIVERED' && shipment.status !== 'DELIVERED') {
      shipment.status = 'DELIVERED';
      shipment.deliveredAt = new Date(
        Date.parse(order.paidAt) + FULFILMENT_STEPS.delivered * 1000,
      ).toISOString();
      changed = true;
    }
  }

  return changed;
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
    })),
    placedAt: order.placedAt,
    paidAt: order.paidAt,
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
