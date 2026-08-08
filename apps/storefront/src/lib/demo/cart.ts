/**
 * Browser-local cart for the demo build.
 *
 * The real cart lives in PostgreSQL and its reservations are enforced by a
 * concurrency-safe service in apps/api. Cloudflare Pages has neither, so this
 * module keeps an equivalent cart in localStorage and reproduces the *visible*
 * behaviour: a 20-minute reservation per line, a live countdown, and expiry
 * that releases the hold. Stock is validated against the static catalog, so
 * over-adding beyond seeded quantity is still rejected.
 *
 * What this deliberately does NOT reproduce: cross-customer contention. There
 * is one browser, so the 100-way concurrency guarantees the real service is
 * built around cannot be demonstrated here.
 */

import { deliveryEstimate, freeShippingProgress } from '@outlet/domain';
import type { CartDto, CartItemDto } from '@outlet/types';
import { CURRENCY_CODE, SETTINGS, brandBySlug, productBySlug, type DemoProduct } from './data';
import { availableFor, getProduct } from './queries';
import { DemoApiError } from './store';

export { DemoApiError };

const CART_KEY = 'outlet_demo_cart';
const RESERVATION_MS = SETTINGS.reservationDurationMinutes * 60 * 1000;

const SHIPPING_RULES = {
  standardShippingMinor: SETTINGS.standardShippingMinor,
  expressShippingMinor: SETTINGS.expressShippingMinor,
  freeShippingThresholdMinor: SETTINGS.freeShippingThresholdMinor,
};

interface StoredLine {
  id: string;
  productSlug: string;
  variantId: string;
  quantity: number;
  /** Epoch ms when the line was added or last topped up. */
  reservedAt: number;
  campaignId: string | null;
}

interface StoredCart {
  id: string;
  lines: StoredLine[];
  /** Parked lines. They hold no reservation, so stock is not held for them. */
  saved: StoredLine[];
  couponCode: string | null;
}

function emptyCart(): StoredCart {
  return { id: 'cart_demo', lines: [], saved: [], couponCode: null };
}

function read(): StoredCart {
  if (typeof window === 'undefined') return emptyCart();
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return emptyCart();
    const parsed = JSON.parse(raw) as StoredCart;
    if (!parsed || !Array.isArray(parsed.lines)) return emptyCart();
    // Carts stored before save-for-later existed have no `saved` array.
    if (!Array.isArray(parsed.saved)) parsed.saved = [];
    return parsed;
  } catch {
    return emptyCart();
  }
}

function write(cart: StoredCart): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // Storage full or blocked — the cart simply will not persist.
  }
}

/** Coupons mirrored from packages/database/src/seed/coupons.ts. */
function couponDiscount(code: string | null, subtotalMinor: number): number {
  if (!code) return 0;
  switch (code.toUpperCase()) {
    case 'WELCOME10':
      return Math.round(subtotalMinor * 0.1);
    case 'SAVE20':
      return subtotalMinor >= 10000 ? 2000 : 0;
    default:
      return 0;
  }
}

function buildItem(line: StoredLine, now: number): CartItemDto | null {
  const product = productBySlug.get(line.productSlug);
  if (!product) return null;
  const variant = product.variants.find((v) => v.id === line.variantId);
  if (!variant) return null;

  const detail = getProduct(product.slug, now);
  const unitPriceMinor = detail?.currentPriceMinor ?? product.outletPriceMinor;
  const brand = brandBySlug.get(product.brandSlug)!;

  const expiresAtMs = line.reservedAt + RESERVATION_MS;
  const secondsRemaining = Math.max(0, Math.floor((expiresAtMs - now) / 1000));
  const isExpired = secondsRemaining <= 0;

  return {
    id: line.id,
    variantId: variant.id,
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    brandName: brand.name,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    imageUrl: product.images[0]?.url ?? null,
    quantity: line.quantity,
    unitPriceMinor,
    originalUnitPriceMinor: product.originalPriceMinor,
    lineTotalMinor: unitPriceMinor * line.quantity,
    campaignId: detail?.campaignId ?? null,
    campaignTitle: null,
    reservation: {
      id: `res_${line.id}`,
      status: isExpired ? 'EXPIRED' : 'ACTIVE',
      expiresAt: new Date(expiresAtMs).toISOString(),
      secondsRemaining,
    },
    isExpired,
    message: isExpired ? 'Reservation expired — this item is no longer held for you.' : null,
  };
}

function toDto(cart: StoredCart, now: number): CartDto {
  const items = cart.lines
    .map((line) => buildItem(line, now))
    .filter((item): item is CartItemDto => item !== null);

  const live = items.filter((item) => !item.isExpired);
  const subtotalMinor = live.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const couponDiscountMinor = couponDiscount(cart.couponCode, subtotalMinor);
  const discountMinor = couponDiscountMinor;

  const afterDiscount = Math.max(0, subtotalMinor - discountMinor);
  const shippingMinor =
    live.length === 0 || afterDiscount >= SETTINGS.freeShippingThresholdMinor
      ? 0
      : SETTINGS.standardShippingMinor;
  const totalMinor = afterDiscount + shippingMinor;
  // Prices are VAT-inclusive; show the tax contained in the total.
  const taxMinor = Math.round((totalMinor * SETTINGS.taxRateBps) / (10_000 + SETTINGS.taxRateBps));

  const messages: string[] = [];
  if (items.some((item) => item.isExpired)) {
    messages.push('Some reservations expired and were released. Re-add those items to continue.');
  }

  // Saved items are rendered like cart lines but hold no reservation, so their
  // countdown fields are cleared rather than showing a stale hold.
  const savedForLater = cart.saved
    .map((line) => buildItem(line, now))
    .filter((item): item is CartItemDto => item !== null)
    .map((item) => ({ ...item, reservation: null, isExpired: false, message: null }));

  return {
    id: cart.id,
    items,
    savedForLater,
    currencyCode: CURRENCY_CODE,
    subtotalMinor,
    discountMinor,
    shippingMinor,
    taxMinor,
    totalMinor,
    couponCode: cart.couponCode,
    couponDiscountMinor,
    itemCount: live.reduce((sum, item) => sum + item.quantity, 0),
    freeShipping: freeShippingProgress(SHIPPING_RULES, afterDiscount),
    deliveryEstimate:
      live.length === 0
        ? null
        : { ...deliveryEstimate('STANDARD', new Date(now)), method: 'STANDARD' },
    messages,
  };
}

// --- Operations ------------------------------------------------------------

export function getCart(now = Date.now()): CartDto {
  return toDto(read(), now);
}

export function addItem(
  input: { variantId: string; quantity: number; campaignId?: string | null },
  now = Date.now(),
): CartDto {
  const cart = read();
  const product = PRODUCTS_BY_VARIANT.get(input.variantId);
  if (!product) throw new DemoApiError(404, 'That product variant does not exist.');
  const variant = product.variants.find((v) => v.id === input.variantId)!;

  const existing = cart.lines.find((line) => line.variantId === input.variantId);
  const desired = (existing?.quantity ?? 0) + input.quantity;
  const available = availableFor(variant);

  if (desired > available) {
    throw new DemoApiError(
      409,
      available === 0 ? 'This size is sold out.' : `Only ${available} left in this size.`,
    );
  }

  if (existing) {
    existing.quantity = desired;
    existing.reservedAt = now; // topping up refreshes the hold
  } else {
    cart.lines.push({
      id: `line_${input.variantId}`,
      productSlug: product.slug,
      variantId: input.variantId,
      quantity: input.quantity,
      reservedAt: now,
      campaignId: input.campaignId ?? null,
    });
  }

  write(cart);
  return toDto(cart, now);
}

export function updateItem(lineId: string, quantity: number, now = Date.now()): CartDto {
  const cart = read();
  const line = cart.lines.find((l) => l.id === lineId);
  if (!line) throw new DemoApiError(404, 'That cart line no longer exists.');

  if (quantity <= 0) {
    cart.lines = cart.lines.filter((l) => l.id !== lineId);
  } else {
    const product = productBySlug.get(line.productSlug)!;
    const variant = product.variants.find((v) => v.id === line.variantId)!;
    const available = availableFor(variant);
    if (quantity > available) {
      throw new DemoApiError(409, `Only ${available} left in this size.`);
    }
    line.quantity = quantity;
    line.reservedAt = now;
  }

  write(cart);
  return toDto(cart, now);
}

export function removeItem(lineId: string, now = Date.now()): CartDto {
  const cart = read();
  cart.lines = cart.lines.filter((l) => l.id !== lineId);
  write(cart);
  return toDto(cart, now);
}

export function applyCoupon(code: string | null, now = Date.now()): CartDto {
  const cart = read();
  const normalised = code ? code.toUpperCase() : null;
  if (normalised && couponDiscount(normalised, 100_000) === 0) {
    throw new DemoApiError(400, 'That coupon code is not valid.');
  }
  cart.couponCode = normalised;
  write(cart);
  return toDto(cart, now);
}

/** Park a cart line: releases its reservation, keeps the choice. */
export function saveForLater(lineId: string, now = Date.now()): CartDto {
  const cart = read();
  const index = cart.lines.findIndex((l) => l.id === lineId);
  if (index === -1) throw new DemoApiError(404, 'That cart line no longer exists.');

  const [line] = cart.lines.splice(index, 1);
  // The same variant can already be parked — add the quantities rather than
  // dropping the line, which would silently lose what the customer chose.
  const alreadySaved = cart.saved.find((l) => l.variantId === line.variantId);
  if (alreadySaved) {
    alreadySaved.quantity += line.quantity;
  } else {
    cart.saved.push(line);
  }
  write(cart);
  return toDto(cart, now);
}

/** Move a parked line back into the cart, re-checking stock and re-reserving. */
export function moveToCart(lineId: string, now = Date.now()): CartDto {
  const cart = read();
  const index = cart.saved.findIndex((l) => l.id === lineId);
  if (index === -1) throw new DemoApiError(404, 'That saved item no longer exists.');

  const line = cart.saved[index];
  const product = productBySlug.get(line.productSlug);
  const variant = product?.variants.find((v) => v.id === line.variantId);
  if (!product || !variant) throw new DemoApiError(404, 'That product is no longer available.');

  const existing = cart.lines.find((l) => l.variantId === line.variantId);
  const desired = (existing?.quantity ?? 0) + line.quantity;
  const available = availableFor(variant);
  if (desired > available) {
    throw new DemoApiError(
      409,
      available === 0
        ? 'This size sold out while it was saved.'
        : `Only ${available} left in this size.`,
    );
  }

  cart.saved.splice(index, 1);
  if (existing) {
    existing.quantity = desired;
    existing.reservedAt = now;
  } else {
    cart.lines.push({ ...line, reservedAt: now });
  }
  write(cart);
  return toDto(cart, now);
}

export function removeSaved(lineId: string, now = Date.now()): CartDto {
  const cart = read();
  cart.saved = cart.saved.filter((l) => l.id !== lineId);
  write(cart);
  return toDto(cart, now);
}

export function clearCart(now = Date.now()): CartDto {
  const cart = emptyCart();
  write(cart);
  return toDto(cart, now);
}

const PRODUCTS_BY_VARIANT = new Map<string, DemoProduct>(
  [...productBySlug.values()].flatMap((product) =>
    product.variants.map((variant) => [variant.id, product] as const),
  ),
);
