/**
 * Demo account area: profile, addresses, wishlist, notification preferences
 * and return requests. Shapes match what the storefront's account pages expect
 * from the real API.
 */

import type { ReturnRequestDto } from '@outlet/types';
import {
  DemoApiError,
  deliverEmail,
  mutate,
  newId,
  pushNotification,
  readState,
  recordEvent,
  requireUser,
  simNow,
  type DemoAddress,
  type DemoReturn,
} from './store';
import { transitionOrder } from './lifecycle';
import { brandBySlug, productBySlug } from './data';

// --- Profile ---------------------------------------------------------------

export function getProfile() {
  const user = requireUser();
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    notificationPreferences: user.notificationPreferences,
  };
}

export function updateProfile(body: { firstName: string; lastName: string }) {
  const firstName = String(body?.firstName ?? '').trim();
  const lastName = String(body?.lastName ?? '').trim();
  if (!firstName || !lastName) throw new DemoApiError(400, 'First and last name are required.');

  return mutate((state) => {
    const user = requireUser(state);
    user.firstName = firstName;
    user.lastName = lastName;
    return getProfileFor(user.id, state.users);
  });
}

function getProfileFor(userId: string, users: ReturnType<typeof readState>['users']) {
  const user = users.find((u) => u.id === userId)!;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    notificationPreferences: user.notificationPreferences,
  };
}

export function updateNotificationPreferences(body: {
  orderUpdates: boolean;
  campaignAnnouncements: boolean;
  newsletter: boolean;
}) {
  return mutate((state) => {
    const user = requireUser(state);
    user.notificationPreferences = {
      orderUpdates: Boolean(body?.orderUpdates),
      campaignAnnouncements: Boolean(body?.campaignAnnouncements),
      newsletter: Boolean(body?.newsletter),
    };
    return user.notificationPreferences;
  });
}

// --- Addresses -------------------------------------------------------------

function toAddressDto(address: DemoAddress) {
  return {
    id: address.id,
    firstName: address.firstName,
    lastName: address.lastName,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    countryCode: address.countryCode,
    phone: address.phone,
    type: address.type,
    isDefaultShipping: address.isDefaultShipping,
    isDefaultBilling: address.isDefaultBilling,
  };
}

export function listAddresses() {
  const user = requireUser();
  return readState()
    .addresses.filter((a) => a.userId === user.id)
    .map(toAddressDto);
}

export function createAddress(body: Record<string, unknown>) {
  const required = ['firstName', 'lastName', 'line1', 'city', 'postalCode', 'countryCode'];
  for (const field of required) {
    if (!String(body?.[field] ?? '').trim()) {
      throw new DemoApiError(400, `${field} is required.`);
    }
  }
  const countryCode = String(body.countryCode).trim().toUpperCase();
  if (countryCode.length !== 2) {
    throw new DemoApiError(400, 'Use a 2-letter ISO country code.');
  }

  return mutate((state) => {
    const user = requireUser(state);
    const isFirst = !state.addresses.some((a) => a.userId === user.id);
    const address: DemoAddress = {
      id: newId('addr'),
      userId: user.id,
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      line1: String(body.line1).trim(),
      line2: body.line2 ? String(body.line2).trim() : null,
      city: String(body.city).trim(),
      region: body.region ? String(body.region).trim() : null,
      postalCode: String(body.postalCode).trim(),
      countryCode,
      phone: body.phone ? String(body.phone).trim() : null,
      type: (body.type as DemoAddress['type']) ?? 'BOTH',
      isDefaultShipping: Boolean(body.isDefaultShipping) || isFirst,
      isDefaultBilling: Boolean(body.isDefaultBilling) || isFirst,
    };
    state.addresses.push(address);
    return toAddressDto(address);
  });
}

export function deleteAddress(addressId: string) {
  return mutate((state) => {
    const user = requireUser(state);
    const before = state.addresses.length;
    state.addresses = state.addresses.filter((a) => !(a.id === addressId && a.userId === user.id));
    if (state.addresses.length === before) {
      throw new DemoApiError(404, 'That address no longer exists.');
    }
    return { ok: true };
  });
}

// --- Wishlist --------------------------------------------------------------

export function listWishlist() {
  const user = requireUser();
  return readState()
    .wishlist.filter((entry) => entry.userId === user.id)
    .map((entry) => {
      const product = productBySlug.get(entry.productSlug);
      if (!product) return null;
      return {
        id: entry.id,
        productId: product.id,
        name: product.name,
        slug: product.slug,
        brandName: brandBySlug.get(product.brandSlug)?.name ?? product.brandSlug,
        imageUrl: product.images[0]?.url ?? null,
        outletPriceMinor: product.outletPriceMinor,
        originalPriceMinor: product.originalPriceMinor,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/** Product ids are `prod_<slug>` (see data.ts), so the slug is recoverable. */
function slugFromProductId(productId: string): string {
  return productId.startsWith('prod_') ? productId.slice('prod_'.length) : productId;
}

export function addToWishlist(body: { productId: string }) {
  const slug = slugFromProductId(String(body?.productId ?? ''));
  if (!productBySlug.has(slug)) throw new DemoApiError(404, 'That product does not exist.');

  return mutate((state) => {
    const user = requireUser(state);
    const existing = state.wishlist.find(
      (entry) => entry.userId === user.id && entry.productSlug === slug,
    );
    if (existing) return { ok: true, alreadyPresent: true };
    state.wishlist.push({
      id: newId('wish'),
      userId: user.id,
      productSlug: slug,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, alreadyPresent: false };
  });
}

export function removeFromWishlist(productId: string) {
  const slug = slugFromProductId(productId);
  return mutate((state) => {
    const user = requireUser(state);
    state.wishlist = state.wishlist.filter(
      (entry) => !(entry.userId === user.id && entry.productSlug === slug),
    );
    return { ok: true };
  });
}

// --- Returns ---------------------------------------------------------------

const RETURNABLE_STATUSES = ['SHIPPED', 'DELIVERED', 'PARTIALLY_RETURNED'];

export function listReturns(): ReturnRequestDto[] {
  const user = requireUser();
  const state = readState();
  return state.returns
    .filter((request) => request.userId === user.id)
    .map((request) => {
      const order = state.orders.find((o) => o.id === request.orderId);
      return {
        id: request.id,
        rmaNumber: request.rmaNumber,
        orderId: request.orderId,
        orderNumber: order?.orderNumber ?? '—',
        status: request.status as ReturnRequestDto['status'],
        reason: request.reason,
        customerNote: request.customerNote,
        items: request.items.map((item) => ({
          ...item,
          condition: item.condition as ReturnRequestDto['items'][number]['condition'],
        })),
        refunds: request.refunds.map((refund) => ({
          ...refund,
          status: refund.status as ReturnRequestDto['refunds'][number]['status'],
        })),
        createdAt: request.createdAt,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function createReturn(body: {
  orderId: string;
  reason: string;
  customerNote: string | null;
  items: Array<{ orderItemId: string; quantity: number }>;
}) {
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    throw new DemoApiError(400, 'Select at least one item to return.');
  }

  return mutate((state) => {
    const user = requireUser(state);
    const order = state.orders.find((o) => o.id === body.orderId && o.userId === user.id);
    if (!order) throw new DemoApiError(404, 'That order does not exist.');
    if (!RETURNABLE_STATUSES.includes(order.status)) {
      throw new DemoApiError(409, 'This order cannot be returned in its current state.');
    }

    const items = body.items.map((requested) => {
      const orderItem = order.items.find((i) => i.id === requested.orderItemId);
      if (!orderItem) throw new DemoApiError(404, 'That order line does not exist.');
      const remaining = orderItem.quantity - orderItem.returnedQuantity;
      const quantity = Number(requested.quantity);
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > remaining) {
        throw new DemoApiError(409, `You can return at most ${remaining} of ${orderItem.name}.`);
      }
      return { orderItem, quantity };
    });

    // Quantities are marked as pending-return but NOT refunded yet: a return
    // that refunds the moment it is requested is not a return workflow, and it
    // hides every state a tester needs to see.
    let refundMinor = 0;
    for (const { orderItem, quantity } of items) {
      refundMinor += orderItem.unitPriceMinor * quantity;
    }

    const sequence = state.returns.length + 1;
    const request: DemoReturn = {
      id: newId('ret'),
      rmaNumber: `RMA-${String(100_000 + sequence)}`,
      userId: user.id,
      orderId: order.id,
      status: 'REQUESTED',
      reason: String(body.reason ?? 'OTHER'),
      customerNote: body.customerNote ?? null,
      items: items.map(({ orderItem, quantity }) => ({
        id: newId('reti'),
        orderItemId: orderItem.id,
        name: orderItem.name,
        sku: orderItem.sku,
        quantity,
        receivedQuantity: 0,
        restockedQuantity: 0,
        condition: 'UNINSPECTED',
        reason: null,
      })),
      refunds: [],
      createdAt: new Date(simNow()).toISOString(),
    };
    state.returns.push(request);

    transitionOrder(state, order, 'RETURN_REQUESTED', {
      note: `Return ${request.rmaNumber} requested.`,
      actor: 'customer',
    });

    recordEvent(state, {
      type: 'RETURN_REQUESTED',
      entityType: 'ReturnRequest',
      entityId: request.rmaNumber,
      actor: 'customer',
      previousState: null,
      newState: 'REQUESTED',
      metadata: { orderNumber: order.orderNumber, refundMinor },
    });

    pushNotification(state, {
      userId: user.id,
      type: 'return.requested',
      title: `Return ${request.rmaNumber} received`,
      body: 'We have your return request and will review it shortly.',
      orderNumber: order.orderNumber,
    });
    deliverEmail(state, {
      to: order.email,
      subject: `Return request received (${request.rmaNumber})`,
      body: 'We have received your return request and will review it shortly. You can follow its progress from your account.',
      template: 'return_requested',
      orderNumber: order.orderNumber,
    });

    return { id: request.id, rmaNumber: request.rmaNumber };
  });
}
