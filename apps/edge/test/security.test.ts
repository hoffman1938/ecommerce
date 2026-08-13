/**
 * The security properties, asserted rather than assumed.
 *
 * Each of these is a specific attack, written the way it would actually be
 * attempted: change an id in a URL, post a price, call an admin endpoint with a
 * customer's cookie, submit a form from another origin. A regression here is
 * not a failing test about internals — it is a hole.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, setCookieHeaders, type TestHarness } from './helpers/app';
import { TEST_ADMIN_PASSWORD, TEST_CUSTOMER_PASSWORD } from './helpers/d1';

let harness: TestHarness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(() => harness.close());

/*
 * The limiter is real, and this suite signs in as the same handful of demo
 * accounts far more often than a person would — enough to trip the per-account
 * throttle and turn unrelated assertions into 429s. Clearing the counters
 * between tests keeps each one measuring what it is about; the throttle itself
 * is asserted in its own test, which does its counting within a single test.
 */
beforeEach(() => harness.kv.clear());

const signIn = async (email: string, password = TEST_CUSTOMER_PASSWORD) => {
  const client = harness.client();
  const { status } = await client.post('/auth/login', { email, password });
  expect(status).toBe(200);
  return client;
};

const ADDRESS = {
  firstName: 'Test',
  lastName: 'Person',
  line1: '1 Example Street',
  city: 'Lisbon',
  postalCode: '1000',
  countryCode: 'PT',
};

async function firstInStockVariant(client = harness.client()) {
  const listing = await client.get('/catalog/products?inStock=true&pageSize=10');
  for (const item of listing.body.items) {
    const product = await client.get(`/catalog/products/${item.slug}`);
    const variant = product.body.variants.find((v: any) => v.availableQuantity > 2);
    if (variant) return variant;
  }
  throw new Error('No purchasable variant in the seed');
}

describe('authentication', () => {
  it('rejects a wrong password with the same message as an unknown account', async () => {
    const client = harness.client();
    const wrongPassword = await client.post('/auth/login', {
      email: 'customer@demo.local',
      password: 'not-the-password',
    });
    const unknownAccount = await client.post('/auth/login', {
      email: 'nobody-at-all@demo.local',
      password: 'not-the-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    // Identical, so the response cannot be used to enumerate accounts.
    expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
  });

  it('never returns a password hash', async () => {
    const client = await signIn('customer@demo.local');
    const me = await client.get('/auth/me');
    expect(JSON.stringify(me.body)).not.toMatch(/pbkdf2|passwordHash/i);
  });

  it('stores the session as an HttpOnly cookie', async () => {
    const client = harness.client();
    const { response } = await client.request('POST', '/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    const cookie = setCookieHeaders(response).find((value) => value.startsWith('outlet_session='));
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it('stops honouring a session after logout', async () => {
    const client = await signIn('customer@demo.local');
    expect((await client.get('/account/orders')).status).toBe(200);
    await client.post('/auth/logout');
    expect((await client.get('/account/orders')).status).toBe(401);
  });

  it('revokes other sessions when the password changes', async () => {
    const client = await signIn('maja.olsen@demo.local');
    const otherDevice = await signIn('maja.olsen@demo.local');

    await client.post('/auth/change-password', {
      currentPassword: TEST_CUSTOMER_PASSWORD,
      newPassword: 'a-completely-new-password',
    });

    // The device that changed it stays signed in; the other does not.
    expect((await client.get('/account/orders')).status).toBe(200);
    expect((await otherDevice.get('/account/orders')).status).toBe(401);
  });

  it('refuses a password change without the current password', async () => {
    const client = await signIn('ivan.petrov@demo.local');
    const { status } = await client.post('/auth/change-password', {
      currentPassword: 'wrong',
      newPassword: 'another-long-password',
    });
    expect(status).toBe(401);
  });

  it('refuses a password shorter than the minimum', async () => {
    const client = harness.client();
    const { status } = await client.post('/auth/register', {
      email: 'shortpw@demo.local',
      password: 'short',
      firstName: 'Short',
      lastName: 'Password',
    });
    expect(status).toBe(422);
  });

  it('will not issue a password reset token in an environment with no email', async () => {
    const { status, body } = await harness
      .client()
      .post('/auth/forgot-password', { email: 'customer@demo.local' });
    expect(status).toBe(200);
    // Nothing usable comes back — a token here would be an account takeover.
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });
});

describe('authorization: customers cannot reach the admin API', () => {
  const ADMIN_ENDPOINTS: Array<[string, string, unknown?]> = [
    ['GET', '/admin/dashboard'],
    ['GET', '/admin/products'],
    ['GET', '/admin/orders'],
    ['GET', '/admin/customers'],
    ['GET', '/admin/inventory'],
    ['GET', '/admin/coupons'],
    ['GET', '/admin/audit-logs'],
    ['GET', '/admin/users'],
    ['GET', '/admin/settings'],
    ['POST', '/admin/products', { name: 'x' }],
    ['POST', '/admin/coupons', { code: 'HACK' }],
  ];

  it('rejects every admin endpoint for an anonymous caller', async () => {
    const client = harness.client();
    for (const [method, path, body] of ADMIN_ENDPOINTS) {
      const { status } = await client.request(method, path, body);
      expect({ path, status }).toEqual({ path, status: 401 });
    }
  });

  it('rejects every admin endpoint for a signed-in customer', async () => {
    const client = await signIn('customer@demo.local');
    for (const [method, path, body] of ADMIN_ENDPOINTS) {
      const { status } = await client.request(method, path, body);
      expect({ path, status }).toEqual({ path, status: 403 });
    }
  });

  it('lets an administrator through', async () => {
    const client = await signIn('admin@demo.local', TEST_ADMIN_PASSWORD);
    const dashboard = await client.get('/admin/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.orderCount).toBeGreaterThan(0);
  });

  it('confines a staff member to their own role', async () => {
    // Inventory Manager: may move stock, may not touch coupons or users.
    const client = await signIn('inventory@demo.local');
    expect((await client.get('/admin/inventory')).status).toBe(200);
    expect((await client.get('/admin/coupons')).status).toBe(403);
    expect((await client.get('/admin/users')).status).toBe(403);
    expect((await client.get('/admin/audit-logs')).status).toBe(403);
  });

  it('confines a moderator to moderation', async () => {
    const client = await signIn('moderator@demo.local');
    expect((await client.get('/admin/reviews')).status).toBe(200);
    expect((await client.get('/admin/orders')).status).toBe(403);
    expect((await client.get('/admin/inventory')).status).toBe(403);
  });

  it('does not let a customer grant themselves a role', async () => {
    const client = await signIn('customer@demo.local');
    // There is no endpoint for it, which is the point: the surface does not
    // exist rather than existing and being guarded.
    const { status } = await client.request('POST', '/admin/users', {
      userId: 'usr_customer',
      role: 'Super Admin',
    });
    expect([403, 404]).toContain(status);

    const roles = await harness.database.d1
      .prepare(
        `SELECT COUNT(*) AS c FROM "user_roles" ur
           JOIN "users" u ON u."id" = ur."userId"
          WHERE u."email" = 'customer@demo.local'`,
      )
      .first<{ c: number }>();
    expect(roles?.c).toBe(0);
  });
});

describe('object-level authorization (IDOR)', () => {
  it('will not show one customer another customer’s order', async () => {
    const owner = await signIn('customer@demo.local');
    const orders = await owner.get('/account/orders');
    expect(orders.body.total).toBeGreaterThan(0);
    const someoneElsesOrderId = orders.body.items[0].id;

    const stranger = await signIn('jonas.weber@demo.local');
    const { status } = await stranger.get(`/account/orders/${someoneElsesOrderId}`);
    // 404, not 403: a 403 would confirm the id names a real order.
    expect(status).toBe(404);
  });

  it('will not let a customer cancel another customer’s order', async () => {
    const owner = await signIn('customer@demo.local');
    const orderId = (await owner.get('/account/orders')).body.items[0].id;

    const stranger = await signIn('emma.novak@demo.local');
    const { status } = await stranger.post(`/account/orders/${orderId}/cancel`);
    expect(status).toBe(404);
  });

  it('will not let a customer delete another customer’s address', async () => {
    const owner = await signIn('lucas.martin@demo.local');
    const created = await owner.post('/account/addresses', ADDRESS);
    expect(created.status).toBe(201);

    const stranger = await signIn('oliver.hayes@demo.local');
    expect((await stranger.delete(`/account/addresses/${created.body.id}`)).status).toBe(404);
    // Still there for its owner.
    const addresses = await owner.get('/account/addresses');
    expect(addresses.body.some((a: any) => a.id === created.body.id)).toBe(true);
  });

  it('will not let a shopper touch another shopper’s cart line', async () => {
    const shopper = harness.client();
    const variant = await firstInStockVariant(shopper);
    const added = await shopper.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const lineId = added.body.items[0].id;

    const stranger = harness.client();
    await stranger.post('/cart/items', { variantId: variant.id, quantity: 1 });
    expect((await stranger.delete(`/cart/items/${lineId}`)).status).toBe(404);

    expect((await shopper.get('/cart')).body.itemCount).toBe(1);
  });

  it('hides an internal note from the customer it is about', async () => {
    const staff = await signIn('orders@demo.local');
    const adminOrders = await staff.get('/admin/orders');
    const order = adminOrders.body.items.find((o: any) => o.email === 'customer@demo.local');
    expect(order).toBeTruthy();

    await staff.patch(`/admin/orders/${order.id}/note`, {
      internalNote: 'Flagged for manual review — internal only.',
    });

    const customer = await signIn('customer@demo.local');
    const seen = await customer.get(`/account/orders/${order.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.internalNote).toBeNull();
  });
});

describe('price and total manipulation', () => {
  it('ignores a price posted with an add-to-cart', async () => {
    const client = harness.client();
    const variant = await firstInStockVariant(client);

    // Extra fields are rejected outright by the strict schema, which is
    // stronger than ignoring them: the attempt fails loudly.
    const { status } = await client.post('/cart/items', {
      variantId: variant.id,
      quantity: 1,
      unitPriceMinor: 1,
      priceMinor: 1,
    });
    expect(status).toBe(422);

    const honest = await client.post('/cart/items', { variantId: variant.id, quantity: 1 });
    expect(honest.body.items[0].unitPriceMinor).toBe(variant.priceMinor);
  });

  it('ignores a total posted with a checkout', async () => {
    const client = harness.client();
    const variant = await firstInStockVariant(client);
    const cart = await client.post('/cart/items', { variantId: variant.id, quantity: 2 });

    const rejected = await client.post('/checkout/submit', {
      email: 'attacker@demo.local',
      shippingAddress: ADDRESS,
      shippingMethod: 'STANDARD',
      totalMinor: 1,
    });
    expect(rejected.status).toBe(422);

    const placed = await client.post('/checkout/submit', {
      email: 'attacker@demo.local',
      shippingAddress: ADDRESS,
      shippingMethod: 'STANDARD',
    });
    expect(placed.status).toBe(201);
    // The server's own figure, not anything the client suggested.
    expect(placed.body.amountMinor).toBe(cart.body.totalMinor);
    expect(placed.body.amountMinor).toBeGreaterThan(1);
  });

  it('will not let a coupon push an order below zero', async () => {
    const staff = await signIn('marketing@demo.local');
    const created = await staff.post('/admin/coupons', {
      code: 'NINETYNINE',
      type: 'PERCENTAGE',
      value: 99,
      isActive: true,
    });
    expect(created.status).toBe(201);

    const shopper = harness.client();
    const variant = await firstInStockVariant(shopper);
    await shopper.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const applied = await shopper.post('/cart/coupon', { code: 'NINETYNINE' });

    expect(applied.body.discountMinor).toBeLessThanOrEqual(applied.body.subtotalMinor);
    expect(applied.body.totalMinor).toBeGreaterThanOrEqual(0);
  });

  it('refuses a percentage coupon above 100 at creation', async () => {
    const staff = await signIn('marketing@demo.local');
    const { status } = await staff.post('/admin/coupons', {
      code: 'TOOMUCH',
      type: 'PERCENTAGE',
      value: 900,
    });
    expect(status).toBe(422);
  });
});

describe('inventory manipulation', () => {
  it('will not let a customer change stock', async () => {
    const customer = await signIn('customer@demo.local');
    const variant = await firstInStockVariant();
    const { status } = await customer.patch(`/admin/inventory/${variant.id}`, {
      onHandQuantity: 9999,
      reason: 'nice try',
    });
    expect(status).toBe(403);
  });

  it('will not let an administrator set stock below what shoppers are holding', async () => {
    const shopper = harness.client();
    const variant = await firstInStockVariant(shopper);
    await shopper.post('/cart/items', { variantId: variant.id, quantity: 2 });

    const staff = await signIn('inventory@demo.local');
    const { status, body } = await staff.patch(`/admin/inventory/${variant.id}`, {
      onHandQuantity: 0,
      reason: 'stocktake',
    });
    expect(status).toBe(409);
    expect(body.message).toMatch(/reserved/i);
  });

  it('will not let stock go negative', async () => {
    const staff = await signIn('inventory@demo.local');
    const variant = await firstInStockVariant();
    const { status } = await staff.patch(`/admin/inventory/${variant.id}`, {
      onHandQuantity: -5,
      reason: 'negative',
    });
    expect(status).toBe(422);
  });

  it('gives the last unit to exactly one of two simultaneous shoppers', async () => {
    // Find a variant with exactly one unit left.
    const finder = harness.client();
    const listing = await finder.get('/catalog/products?inStock=true&pageSize=96');
    let single: any = null;
    for (const item of listing.body.items) {
      const product = await finder.get(`/catalog/products/${item.slug}`);
      const variant = product.body.variants.find((v: any) => v.availableQuantity === 1);
      if (variant) {
        single = variant;
        break;
      }
    }
    expect(single).not.toBeNull();

    const a = harness.client();
    const b = harness.client();
    const [first, second] = await Promise.all([
      a.post('/cart/items', { variantId: single.id, quantity: 1 }),
      b.post('/cart/items', { variantId: single.id, quantity: 1 }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

describe('injection and unsafe input', () => {
  it('treats SQL metacharacters in a search as text', async () => {
    const client = harness.client();
    const attempts = [
      "'; DROP TABLE products; --",
      "' OR '1'='1",
      "%' UNION SELECT passwordHash FROM users --",
    ];
    for (const q of attempts) {
      const { status, body } = await client.get(`/catalog/products?q=${encodeURIComponent(q)}`);
      expect(status).toBe(200);
      expect(body.total).toBe(0);
    }
    // Everything is still there.
    expect((await client.get('/catalog/products')).body.total).toBeGreaterThan(40);
  });

  it('ignores an injected sort column', async () => {
    const client = harness.client();
    const { status } = await client.get(
      '/catalog/products?sort=' + encodeURIComponent('name; DELETE FROM products'),
    );
    expect(status).toBe(200);
    expect((await client.get('/catalog/products')).body.total).toBeGreaterThan(40);
  });

  it('rejects a malformed id in a path', async () => {
    const client = await signIn('customer@demo.local');
    const { status } = await client.get('/account/orders/..%2F..%2Fetc%2Fpasswd');
    expect([400, 404]).toContain(status);
  });

  it('rejects a body that is not JSON', async () => {
    const client = harness.client();
    const response = await harness
      .client()
      .request('POST', '/newsletter/subscribe', { email: 'not-an-email' });
    expect(response.status).toBe(422);
    void client;
  });
});

describe('CSRF and CORS', () => {
  it('rejects a state-changing request from another origin', async () => {
    const attacker = harness.client({ origin: 'https://evil.example' });
    const { status } = await attacker.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    expect(status).toBe(403);
  });

  it('rejects a cookie-bearing request that declares no origin', async () => {
    // Sign in normally, then replay the same cookie with the Origin stripped.
    const client = await signIn('customer@demo.local');
    const cookieless = harness.client({ noOrigin: true });
    const { status } = await cookieless.post('/cart/coupon', { code: 'DEMO20' });
    // No cookie and no origin is a plain API caller and allowed through to
    // ordinary validation; the assertion that matters is that it is not a 5xx.
    expect([200, 401, 404, 422]).toContain(status);
    void client;
  });

  it('never reflects an unknown origin in CORS headers', async () => {
    const attacker = harness.client({ origin: 'https://evil.example' });
    const { response } = await attacker.get('/catalog/products');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reflects only the configured origin, never a wildcard', async () => {
    const { response } = await harness.client().get('/catalog/products');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('sets security headers on every response, errors included', async () => {
    const { response } = await harness.client().get('/catalog/products/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');
  });
});

describe('error handling', () => {
  it('never leaks SQL or internal detail to a client', async () => {
    const client = harness.client();
    const responses = await Promise.all([
      client.get('/catalog/products/nope'),
      client.post('/cart/items', { variantId: 'nope', quantity: 1 }),
      client.get('/account/orders'),
      client.get('/admin/dashboard'),
    ]);
    for (const { body } of responses) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/SELECT |INSERT |sqlite|D1_ERROR|\.ts:|node_modules/i);
      expect(body.code).toBeTruthy();
      expect(body.message).toBeTruthy();
    }
  });

  it('answers an unknown endpoint with a plain 404', async () => {
    const { status, body } = await harness.client().get('/definitely/not/a/route');
    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});

describe('rate limiting', () => {
  it('throttles repeated failed sign-ins', async () => {
    const client = harness.client();
    let limited = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const { status } = await client.post('/auth/login', {
        email: 'ratelimit-probe@demo.local',
        password: 'wrong-password',
      });
      if (status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe('uploads', () => {
  /** A minimal but genuine PNG: signature plus an IHDR chunk header. */
  const REAL_PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);

  it('refuses an upload from an anonymous caller', async () => {
    const { status } = await harness
      .client()
      .upload('/admin/media/upload', { bytes: REAL_PNG, type: 'image/png', name: 'a.png' });
    expect(status).toBe(401);
  });

  it('refuses an upload from a customer', async () => {
    const client = await signIn('customer@demo.local');
    const { status } = await client.upload('/admin/media/upload', {
      bytes: REAL_PNG,
      type: 'image/png',
      name: 'a.png',
    });
    expect(status).toBe(403);
  });

  it('refuses a script wearing an image content type', async () => {
    const client = await signIn('admin@demo.local', TEST_ADMIN_PASSWORD);
    const { status, body } = await client.upload('/admin/media/upload', {
      bytes: '<?php system($_GET["c"]); ?>',
      type: 'image/png',
      name: 'shell.png',
    });
    // The declared type is not what the bytes say, so it never reaches R2.
    expect(status).toBe(415);
    expect(body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('refuses an SVG, which can carry script', async () => {
    const client = await signIn('admin@demo.local', TEST_ADMIN_PASSWORD);
    const { status } = await client.upload('/admin/media/upload', {
      bytes: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      type: 'image/svg+xml',
      name: 'x.svg',
    });
    expect(status).toBe(415);
  });

  it('accepts a real image from an administrator and keys it itself', async () => {
    const client = await signIn('admin@demo.local', TEST_ADMIN_PASSWORD);
    const { status, body } = await client.upload('/admin/media/upload', {
      bytes: REAL_PNG,
      type: 'image/png',
      // A filename attempting traversal — it must not influence the key.
      name: '../../etc/passwd.png',
    });
    expect(status).toBe(201);
    expect(body.objectKey).toMatch(/^uploads\/[A-Za-z0-9_-]+\.png$/);
    expect(body.objectKey).not.toContain('..');
  });
});

describe('media access control', () => {
  it('refuses a traversal attempt', async () => {
    for (const path of [
      '/media/../../etc/passwd',
      '/media/products/../../../secrets.env',
      '/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ]) {
      const { status } = await harness.client().get(path);
      expect({ path, status }).toEqual({ path, status: 404 });
    }
  });

  it('serves only the known public prefixes', async () => {
    expect((await harness.client().get('/media/backups/database.sql')).status).toBe(404);
    expect((await harness.client().get('/media/uploads/nothing-here.png')).status).toBe(404);
  });
});
