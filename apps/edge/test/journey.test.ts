/**
 * The customer journey, end to end, against real data.
 *
 * Home → product → variant → cart → coupon → checkout → demo payment →
 * confirmation → order history, plus the edge cases a reviewer will try:
 * an expired coupon, more than there is in stock, a double-clicked Place Order.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type TestHarness } from './helpers/app';
import { TEST_CUSTOMER_PASSWORD } from './helpers/d1';

let harness: TestHarness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(() => harness.close());

/** Finds a variant with stock, so a test does not depend on seed ordering. */
async function inStockVariant(client = harness.client()) {
  const listing = await client.get('/catalog/products?inStock=true&pageSize=24');
  for (const item of listing.body.items) {
    const product = await client.get(`/catalog/products/${item.slug}`);
    const variant = product.body.variants.find((v: any) => v.availableQuantity > 2 && v.isEnabled);
    if (variant) return { product: product.body, variant };
  }
  throw new Error('The seed produced no purchasable variant');
}

describe('browsing', () => {
  it('serves a populated catalogue', async () => {
    const client = harness.client();
    const { body } = await client.get('/catalog/products');
    expect(body.total).toBeGreaterThanOrEqual(40);
    expect(body.items[0].imageUrl).toBeTruthy();
  });

  it('serves the category tree, brands and campaigns', async () => {
    const client = harness.client();
    const [categories, brands, campaigns] = await Promise.all([
      client.get('/catalog/categories'),
      client.get('/catalog/brands'),
      client.get('/campaigns'),
    ]);
    expect(categories.body.length).toBeGreaterThan(0);
    expect(categories.body[0].href).toMatch(/^\/shop\//);
    expect(brands.body.length).toBe(10);
    expect(campaigns.body.length).toBeGreaterThan(0);
  });

  it('serves CMS pages', async () => {
    const { status, body } = await harness.client().get('/content/pages/shipping_info');
    expect(status).toBe(200);
    expect(body.body.length).toBeGreaterThan(0);
  });

  it('resolves a three-level shop path', async () => {
    const { status, body } = await harness
      .client()
      .get('/catalog/categories/path?path=women/clothing/dresses');
    expect(status).toBe(200);
    expect(body).toHaveLength(3);
    expect(body[2].level).toBe('subcategory');
  });

  it('renders product artwork when the bucket is empty', async () => {
    const client = harness.client();
    const listing = await client.get('/catalog/products?pageSize=1');
    const { response } = await client.get(listing.body.items[0].imageUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
    expect(response.headers.get('x-media-source')).toBe('generated');
  });
});

describe('cart', () => {
  it('adds, reprices from the database, and survives as a cookie', async () => {
    const client = harness.client();
    const { product, variant } = await inStockVariant(client);

    const added = await client.post('/cart/items', { variantId: variant.id, quantity: 2 });
    expect(added.status).toBe(200);
    expect(added.body.itemCount).toBe(2);
    expect(added.body.items[0].unitPriceMinor).toBe(variant.priceMinor);
    expect(added.body.subtotalMinor).toBe(variant.priceMinor * 2);
    expect(client.hasCookie('outlet_cart')).toBe(true);

    // The same client, a fresh request: the cart is still there.
    const reread = await client.get('/cart');
    expect(reread.body.itemCount).toBe(2);
    expect(reread.body.items[0].productName).toBe(product.name);

    // A different browser sees an empty cart.
    const stranger = harness.client();
    expect((await stranger.get('/cart')).body.itemCount).toBe(0);
  });

  it('holds stock while the item is in the cart', async () => {
    const client = harness.client();
    const { product, variant } = await inStockVariant(client);
    const before = variant.availableQuantity;

    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });

    const after = await client.get(`/catalog/products/${product.slug}`);
    const refreshed = after.body.variants.find((v: any) => v.id === variant.id);
    expect(refreshed.availableQuantity).toBe(before - 1);
  });

  it('parks an item without holding stock, and restores it', async () => {
    const client = harness.client();
    const { product, variant } = await inStockVariant(client);
    const before = variant.availableQuantity;

    const added = await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const lineId = added.body.items[0].id;

    const saved = await client.post(`/cart/items/${lineId}/save`);
    expect(saved.body.items).toHaveLength(0);
    expect(saved.body.savedForLater).toHaveLength(1);

    // Parked means the units went back on the shelf.
    const released = await client.get(`/catalog/products/${product.slug}`);
    expect(released.body.variants.find((v: any) => v.id === variant.id).availableQuantity).toBe(
      before,
    );

    const restored = await client.post(`/cart/saved/${lineId}/restore`);
    expect(restored.body.items).toHaveLength(1);
    expect(restored.body.savedForLater).toHaveLength(0);
  });

  it('refuses more than there is in stock', async () => {
    const client = harness.client();
    const listing = await client.get('/catalog/products?inStock=true&pageSize=96');
    let scarce: any = null;
    for (const item of listing.body.items) {
      const product = await client.get(`/catalog/products/${item.slug}`);
      const variant = product.body.variants.find(
        (v: any) => v.availableQuantity > 0 && v.availableQuantity < 5,
      );
      if (variant) {
        scarce = variant;
        break;
      }
    }
    expect(scarce).not.toBeNull();

    const { status, body } = await client.post('/cart/items', {
      variantId: scarce.id,
      quantity: scarce.availableQuantity + 3,
    });
    expect(status).toBe(409);
    expect(body.code).toBe('OUT_OF_STOCK');
  });

  it('rejects a variant that does not exist', async () => {
    const { status } = await harness
      .client()
      .post('/cart/items', { variantId: 'var_nonexistent', quantity: 1 });
    expect(status).toBe(404);
  });

  it('changes quantity and removes a line', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    const added = await client.post('/cart/items', { variantId: variant.id, quantity: 2 });
    const lineId = added.body.items[0].id;

    const reduced = await client.patch(`/cart/items/${lineId}`, { quantity: 1 });
    expect(reduced.body.itemCount).toBe(1);

    const removed = await client.delete(`/cart/items/${lineId}`);
    expect(removed.body.itemCount).toBe(0);
  });
});

describe('coupons', () => {
  it('applies a percentage code and reduces the total', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    const added = await client.post('/cart/items', { variantId: variant.id, quantity: 2 });
    const before = added.body.totalMinor;

    const applied = await client.post('/cart/coupon', { code: 'DEMO20' });
    expect(applied.status).toBe(200);
    expect(applied.body.couponCode).toBe('DEMO20');
    expect(applied.body.discountMinor).toBeGreaterThan(0);
    expect(applied.body.totalMinor).toBeLessThan(before);
    // 20%, capped at €30.
    expect(applied.body.discountMinor).toBe(
      Math.min(3000, Math.round(applied.body.subtotalMinor * 0.2)),
    );
  });

  it('rejects an unknown code', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const { status, body } = await client.post('/cart/coupon', { code: 'NOTACODE' });
    expect(status).toBe(422);
    expect(body.code).toBe('INVALID_COUPON');
  });

  it('rejects an expired code', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const { status, body } = await client.post('/cart/coupon', { code: 'EXPIRED10' });
    expect(status).toBe(422);
    expect(body.message).toMatch(/expired/i);
  });

  it('honours a minimum order value', async () => {
    const client = harness.client();
    const listing = await client.get('/catalog/products?inStock=true&sort=price_asc&pageSize=10');
    const product = await client.get(`/catalog/products/${listing.body.items[0].slug}`);
    const variant = product.body.variants.find((v: any) => v.availableQuantity > 0);

    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    // SAVE20 needs €100; the cheapest single item is well under that.
    const applied = await client.post('/cart/coupon', { code: 'SAVE20' });
    expect(applied.body.discountMinor).toBe(0);
  });

  it('waives shipping with FREESHIP', async () => {
    const client = harness.client();
    const listing = await client.get(
      '/catalog/products?inStock=true&minPrice=25&maxPrice=60&pageSize=10',
    );
    const product = await client.get(`/catalog/products/${listing.body.items[0].slug}`);
    const variant = product.body.variants.find((v: any) => v.availableQuantity > 0);

    const added = await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    expect(added.body.shippingMinor).toBeGreaterThan(0);

    const applied = await client.post('/cart/coupon', { code: 'FREESHIP' });
    expect(applied.body.shippingMinor).toBe(0);
  });
});

describe('demo checkout', () => {
  const address = {
    firstName: 'Demo',
    lastName: 'Reviewer',
    line1: '1 Example Street',
    city: 'Lisbon',
    postalCode: '1000',
    countryCode: 'PT',
  };

  it('places a real order and empties the cart', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    const added = await client.post('/cart/items', { variantId: variant.id, quantity: 2 });
    const expectedTotal = added.body.totalMinor;

    const quote = await client.post('/checkout/start');
    expect(quote.status).toBe(200);
    expect(quote.body.shippingMethods).toHaveLength(2);
    expect(quote.body.reservationDeadline).toBeTruthy();

    const submitted = await client.post('/checkout/submit', {
      email: 'reviewer@demo.local',
      shippingAddress: address,
      shippingMethod: 'STANDARD',
      idempotencyKey: 'journey-order-1',
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.provider).toBe('demo');
    expect(submitted.body.amountMinor).toBe(expectedTotal);

    const payment = await client.get(`/payments/${submitted.body.paymentId}/status`);
    expect(payment.body.status).toBe('PAID');
    expect(payment.body.demo).toBe(true);
    expect(payment.body.orderNumber).toMatch(/^OUT-\d+$/);

    expect((await client.get('/cart')).body.itemCount).toBe(0);
  });

  it('decrements stock by exactly what was bought', async () => {
    const client = harness.client();
    const { product, variant } = await inStockVariant(client);
    const before = variant.availableQuantity;

    await client.post('/cart/items', { variantId: variant.id, quantity: 2 });
    await client.post('/checkout/submit', {
      email: 'reviewer@demo.local',
      shippingAddress: address,
      shippingMethod: 'STANDARD',
      idempotencyKey: 'journey-stock',
    });

    const after = await client.get(`/catalog/products/${product.slug}`);
    expect(after.body.variants.find((v: any) => v.id === variant.id).availableQuantity).toBe(
      before - 2,
    );
  });

  it('returns the same order when the button is clicked twice', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });

    const body = {
      email: 'reviewer@demo.local',
      shippingAddress: address,
      shippingMethod: 'STANDARD' as const,
      idempotencyKey: 'double-click-key',
    };
    const first = await client.post('/checkout/submit', body);
    const second = await client.post('/checkout/submit', body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.orderId).toBe(first.body.orderId);
  });

  it('refuses an empty cart', async () => {
    const client = harness.client();
    const { status, body } = await client.post('/checkout/submit', {
      email: 'reviewer@demo.local',
      shippingAddress: address,
      shippingMethod: 'STANDARD',
    });
    expect(status).toBe(422);
    expect(body.code).toBe('CART_EMPTY');
  });

  it('rejects an incomplete address', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });

    const { status, body } = await client.post('/checkout/submit', {
      email: 'reviewer@demo.local',
      shippingAddress: { ...address, postalCode: '' },
      shippingMethod: 'STANDARD',
    });
    expect(status).toBe(422);
    expect(body.code).toBe('VALIDATION_FAILED');
  });
});

describe('accounts and order history', () => {
  it('registers, signs in, and lists its own orders', async () => {
    const client = harness.client();
    const registered = await client.post('/auth/register', {
      email: 'newshopper@demo.local',
      password: 'a-long-enough-password',
      firstName: 'New',
      lastName: 'Shopper',
    });
    expect(registered.status).toBe(201);

    const me = await client.get('/auth/me');
    expect(me.body.email).toBe('newshopper@demo.local');
    expect(me.body.isStaff).toBe(false);

    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const placed = await client.post('/checkout/submit', {
      email: 'newshopper@demo.local',
      shippingAddress: {
        firstName: 'New',
        lastName: 'Shopper',
        line1: '2 Example Street',
        city: 'Porto',
        postalCode: '4000',
        countryCode: 'PT',
      },
      shippingMethod: 'EXPRESS',
    });
    expect(placed.status).toBe(201);

    const orders = await client.get('/account/orders');
    expect(orders.body.total).toBe(1);
    expect(orders.body.items[0].items.length).toBeGreaterThan(0);
    expect(orders.body.items[0].timeline.length).toBeGreaterThan(0);
    expect(orders.body.items[0].payments[0].provider).toBe('demo');
  });

  it('signs an existing demo customer in and out', async () => {
    const client = harness.client();
    const login = await client.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect((await client.get('/auth/me')).body.email).toBe('customer@demo.local');

    const orders = await client.get('/account/orders');
    expect(orders.body.total).toBeGreaterThan(0);

    await client.post('/auth/logout');
    expect((await client.get('/auth/me')).body).toBeNull();
    expect((await client.get('/account/orders')).status).toBe(401);
  });

  it('adds and removes a wishlist item', async () => {
    const client = harness.client();
    await client.post('/auth/login', {
      email: 'jonas.weber@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });

    const listing = await client.get('/catalog/products?pageSize=1');
    const productId = listing.body.items[0].id;

    await client.post('/account/wishlist', { productId });
    const wishlist = await client.get('/account/wishlist');
    expect(wishlist.body.some((item: any) => item.productId === productId)).toBe(true);

    await client.delete(`/account/wishlist/${productId}`);
    const after = await client.get('/account/wishlist');
    expect(after.body.some((item: any) => item.productId === productId)).toBe(false);
  });

  it('carries an anonymous cart into the account on sign-in', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });

    await client.post('/auth/login', {
      email: 'sofia.rossi@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });

    const cart = await client.get('/cart');
    expect(cart.body.itemCount).toBe(1);
  });
});

describe('health', () => {
  it('reports a seeded, reachable database', async () => {
    const { status, body } = await harness.client().get('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.catalogue).toBe('seeded');
    expect(body.activeProducts).toBeGreaterThan(40);
    // Configuration is reported as present or absent, never echoed.
    expect(JSON.stringify(body)).not.toContain('test-session-secret');
  });
});
