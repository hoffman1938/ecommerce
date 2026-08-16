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

  /**
   * Image URLs have to be absolute.
   *
   * They are stored as `/media/<key>`, and the storefront puts them straight
   * into `<img src>`. The pages are on `*.pages.dev` and this API is on
   * `*.workers.dev`, so a relative path resolves against Pages, where nothing
   * serves `/media` — every product image, category tile and campaign cover on
   * the deployed site 404'd. Same-origin local testing never showed it.
   */
  it('returns media URLs a different origin can load', async () => {
    const client = harness.client();
    const listing = await client.get('/catalog/products?pageSize=3');

    for (const item of listing.body.items) {
      expect(item.imageUrl).toMatch(/^https?:\/\//);
      expect(item.imageUrl).toContain('/media/');
    }

    // And the same for the surfaces that carry their own artwork.
    const [categories, campaigns] = await Promise.all([
      client.get('/catalog/categories'),
      client.get('/campaigns'),
    ]);
    for (const row of [...categories.body, ...campaigns.body]) {
      const url = row.imageUrl ?? row.coverImageUrl;
      if (url) expect(url).toMatch(/^https?:\/\//);
    }

    // Nothing origin-relative survives anywhere in the payload.
    expect(JSON.stringify(listing.body)).not.toContain('"/media/');
  });

  it('honours PUBLIC_MEDIA_BASE_URL when media moves to a CDN', async () => {
    const cdn = await createHarness({ PUBLIC_MEDIA_BASE_URL: 'https://cdn.example.test/' });
    try {
      const listing = await cdn.client().get('/catalog/products?pageSize=1');
      expect(listing.body.items[0].imageUrl).toMatch(/^https:\/\/cdn\.example\.test\/media\//);
    } finally {
      cdn.close();
    }
  });

  /**
   * The header that decides whether a fetched image is allowed to be *drawn*.
   *
   * `Cross-Origin-Resource-Policy: same-site` is correct for the JSON API and
   * fatal for images here: pages.dev and workers.dev are separate sites, so the
   * browser fetched every image with a 200 and then refused to render it. The
   * page showed blank tiles with nothing in the console to chase.
   */
  it('lets another site embed catalogue images', async () => {
    const client = harness.client();
    const listing = await client.get('/catalog/products?pageSize=1');
    const { pathname } = new URL(listing.body.items[0].imageUrl);
    const { response } = await client.get(pathname);

    expect(response.status).toBe(200);
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('still refuses to let another site embed an API response', async () => {
    const { response } = await harness.client().get('/catalog/products?pageSize=1');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-site');
  });

  it('renders product artwork when the bucket is empty', async () => {
    const client = harness.client();
    const listing = await client.get('/catalog/products?pageSize=1');
    // The listing now hands out an absolute URL; the client takes a path.
    const { pathname } = new URL(listing.body.items[0].imageUrl);
    const { response } = await client.get(pathname);
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

  it('keeps a topped-up item as one line rather than listing it twice', async () => {
    const client = harness.client();
    const { variant } = await inStockVariant(client);

    // Each add takes its own reservation for the units it contributes, so this
    // line ends up with two live holds. It is still one item in the bag: the
    // regression this guards is the cart reading back once per reservation,
    // showing the same shoe twice at full quantity with the subtotal doubled.
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const topped = await client.post('/cart/items', { variantId: variant.id, quantity: 1 });

    expect(topped.body.items).toHaveLength(1);
    expect(topped.body.items[0].quantity).toBe(2);
    expect(topped.body.itemCount).toBe(2);
    expect(topped.body.subtotalMinor).toBe(variant.priceMinor * 2);

    // And on a fresh read, which is the path the drawer actually uses.
    const reread = await client.get('/cart');
    expect(reread.body.items).toHaveLength(1);
    expect(reread.body.itemCount).toBe(2);
    expect(reread.body.subtotalMinor).toBe(variant.priceMinor * 2);
    // The countdown still has a hold to show.
    expect(reread.body.items[0].reservation).not.toBeNull();
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

    // `{ user }`, not the user bare: the storefront header and the admin
    // panel's permission gate both read `data.user`.
    const me = await client.get('/auth/me');
    expect(me.body.user.email).toBe('newshopper@demo.local');
    expect(me.body.user.isStaff).toBe(false);

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

    // A bare array, as the NestJS API publishes it and as the account pages
    // read it — they call `.slice(0, 5)` and map over the response directly.
    const orders = await client.get('/account/orders');
    expect(Array.isArray(orders.body)).toBe(true);
    expect(orders.body).toHaveLength(1);
    expect(orders.response.headers.get('x-total-count')).toBe('1');
    expect(orders.body[0].items.length).toBeGreaterThan(0);
    expect(orders.body[0].timeline.length).toBeGreaterThan(0);
    expect(orders.body[0].payments[0].provider).toBe('demo');
  });

  it('signs an existing demo customer in and out', async () => {
    const client = harness.client();
    const login = await client.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect((await client.get('/auth/me')).body.user.email).toBe('customer@demo.local');

    const orders = await client.get('/account/orders');
    expect(orders.body.length).toBeGreaterThan(0);

    await client.post('/auth/logout');
    expect((await client.get('/auth/me')).body.user).toBeNull();
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

/**
 * The substitute for email.
 *
 * There is no provider and no SMTP transport in this build, so every message
 * the platform would have sent is written to the account and read back here.
 * The storefront binds `{ items, unreadCount }` on both endpoints — a bare
 * array renders as a permanently empty inbox rather than as an error, which is
 * why the envelope is asserted and not just the status code.
 */
describe('notifications and the simulated mailbox', () => {
  const signIn = async () => {
    const client = harness.client();
    await client.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    return client;
  };

  it('serves seeded history in both tabs', async () => {
    const client = await signIn();

    const notifications = await client.get('/account/notifications');
    expect(notifications.status).toBe(200);
    expect(notifications.body.items.length).toBeGreaterThan(0);
    expect(typeof notifications.body.unreadCount).toBe('number');

    const inbox = await client.get('/account/inbox');
    expect(inbox.status).toBe(200);
    expect(inbox.body.items.length).toBeGreaterThan(0);
    expect(inbox.body.items[0].subject).toBeTruthy();
    expect(inbox.body.items[0].to).toBe('customer@demo.local');
  });

  it('writes a confirmation to the mailbox when an order is placed', async () => {
    const client = await signIn();
    const before = (await client.get('/account/inbox')).body.items.length;

    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const placed = await client.post('/checkout/submit', {
      email: 'customer@demo.local',
      shippingAddress: {
        firstName: 'Nina',
        lastName: 'Ortiz',
        line1: '3 Example Street',
        city: 'Lisbon',
        postalCode: '1000',
        countryCode: 'PT',
      },
      shippingMethod: 'STANDARD',
    });
    expect(placed.status).toBe(201);

    const order = await client.get(`/account/orders/${placed.body.orderId}`);
    const inbox = await client.get('/account/inbox');
    expect(inbox.body.items.length).toBe(before + 1);
    expect(inbox.body.items[0].template).toBe('order_confirmation');
    // Linked to the order, so the message can be opened from it and back.
    expect(inbox.body.items[0].orderNumber).toBe(order.body.orderNumber);
  });

  it('marks a message read and drops the unread count', async () => {
    const client = await signIn();
    const before = await client.get('/account/inbox');
    // The confirmation the previous case placed is unread by construction —
    // finding one in the seed instead would depend on how the fixture happens
    // to distribute readAt.
    const unread = before.body.items.find((email: any) => email.readAt === null);
    expect(unread).toBeTruthy();

    expect((await client.post(`/account/inbox/${unread.id}/read`, {})).status).toBe(200);

    const after = await client.get('/account/inbox');
    expect(after.body.unreadCount).toBe(before.body.unreadCount - 1);
    expect(after.body.items.find((email: any) => email.id === unread.id).readAt).toBeTruthy();
  });

  it('will not show one customer another customer’s mailbox', async () => {
    const other = harness.client();
    await other.post('/auth/login', {
      email: 'jonas.weber@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    const inbox = await other.get('/account/inbox');
    for (const email of inbox.body.items) {
      expect(email.to).toBe('jonas.weber@demo.local');
    }
  });

  it('needs a session', async () => {
    expect((await harness.client().get('/account/inbox')).status).toBe(401);
  });
});

/**
 * The account screens' contract, the same way test/admin-panel.test.ts covers
 * the panel's: the shape each page binds to, asserted here because a page that
 * reads `profile.notificationPreferences.orderUpdates` off an object that does
 * not carry it throws during render and shows the customer a blank screen —
 * which no status-code assertion notices.
 */
describe('what the account pages read', () => {
  const signIn = async () => {
    const client = harness.client();
    await client.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    return client;
  };

  it('sends checkout to a confirmation URL that page can actually read', async () => {
    const client = await signIn();
    const { variant } = await inStockVariant(client);
    await client.post('/cart/items', { variantId: variant.id, quantity: 1 });

    const placed = await client.post('/checkout/submit', {
      email: 'customer@demo.local',
      shippingAddress: {
        firstName: 'Nina',
        lastName: 'Ortiz',
        line1: '14 Rua das Flores',
        city: 'Lisbon',
        postalCode: '1200-192',
        countryCode: 'PT',
      },
      shippingMethod: 'STANDARD',
    });
    expect(placed.status).toBe(201);

    // `orderId`, because /checkout/result polls /account/orders/:orderId and
    // shows "Missing order reference" without it.
    const url = new URL(placed.body.redirectUrl, 'http://storefront.test');
    expect(url.pathname).toBe('/checkout/result');
    expect(url.searchParams.get('orderId')).toBe(placed.body.orderId);
    expect(url.searchParams.get('paymentId')).toBe(placed.body.paymentId);

    // And that id resolves, which is the thing the page goes on to do.
    expect((await client.get(`/account/orders/${url.searchParams.get('orderId')}`)).status).toBe(
      200,
    );
  });

  it('gives the profile its notification preferences', async () => {
    const { status, body } = await (await signIn()).get('/account/profile');
    expect(status).toBe(200);
    expect(body.notificationPreferences).toEqual({
      orderUpdates: expect.any(Boolean),
      campaignAnnouncements: expect.any(Boolean),
      newsletter: expect.any(Boolean),
    });
  });

  it('saves preferences under the names the form sends', async () => {
    const client = await signIn();
    const { status } = await client.patch('/account/notification-preferences', {
      orderUpdates: false,
      campaignAnnouncements: true,
      newsletter: true,
    });
    expect(status).toBe(200);

    const profile = await client.get('/account/profile');
    expect(profile.body.notificationPreferences.orderUpdates).toBe(false);
    expect(profile.body.notificationPreferences.newsletter).toBe(true);
  });

  it('lists orders as an array the overview can slice', async () => {
    const { status, body } = await (await signIn()).get('/account/orders');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(typeof body.slice).toBe('function');
    expect(body[0].items.length).toBeGreaterThan(0);
  });
});

/**
 * Password reset, which this deployment deliberately does not do.
 *
 * Both halves answer with the explanation rather than 404ing, so the screens
 * that link to them read as "the demo does not send email" instead of as a
 * broken deployment. See SECURITY.md.
 */
describe('password reset', () => {
  it('explains why the request cannot be honoured', async () => {
    const { status, body } = await harness
      .client()
      .post('/auth/forgot-password', { email: 'customer@demo.local' });
    expect(status).toBe(200);
    expect(body.message).toMatch(/email provider/i);
  });

  it('refuses to complete a reset, and says why', async () => {
    const { status, body } = await harness
      .client()
      .post('/auth/reset-password', { token: 'anything', password: 'a-long-enough-password' });
    expect(status).toBe(501);
    expect(body.code).toBe('FEATURE_UNAVAILABLE');
    expect(body.message).toMatch(/email provider/i);
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
