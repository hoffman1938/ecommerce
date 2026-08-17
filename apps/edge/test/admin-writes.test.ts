/**
 * The administration panel's writes.
 *
 * `admin-panel.test.ts` grew one case at a time, each after a specific screen
 * broke. This file closes the gap from the other direction: it covers the
 * endpoints the panel calls that no test had reached, because that set is
 * exactly where the next broken screen comes from. Every defect found in the
 * sweep this file was written during was inside it, and none of them was
 * visible as a bad status code — a silent clamp, an envelope the page could not
 * read, a validation error on the panel's own button.
 *
 * Same rule as the file it sits beside: copy the call out of apps/admin
 * verbatim, do not restate it in whatever shape the API happens to prefer.
 *
 * Its own harness, so the mutations here — disabling an account, deleting
 * reviews, walking returns forward — cannot reorder or starve the fixtures the
 * other file depends on.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type TestClient, type TestHarness } from './helpers/app';
import { TEST_ADMIN_PASSWORD, TEST_CUSTOMER_PASSWORD } from './helpers/d1';

let harness: TestHarness;
let admin: TestClient;

beforeAll(async () => {
  harness = await createHarness();
  admin = harness.client();
  const signIn = await admin.post('/auth/login', {
    email: 'admin@demo.local',
    password: TEST_ADMIN_PASSWORD,
  });
  expect(signIn.status).toBe(200);
});
afterAll(() => harness.close());

// --- Fixtures ----------------------------------------------------------------

/** A variant with stock and nothing reserved, so an adjustment is unobstructed. */
async function freeVariant(): Promise<{ id: string; sku: string; onHand: number }> {
  const row = await harness.database.d1
    .prepare(
      `SELECT v."id", v."sku", b."onHandQuantity" AS "onHand"
         FROM "product_variants" v
         JOIN "inventory_balances" b ON b."variantId" = v."id"
        WHERE b."reservedQuantity" = 0 AND b."onHandQuantity" > 5
        LIMIT 1`,
    )
    .first<{ id: string; sku: string; onHand: number }>();
  expect(row).toBeTruthy();
  return row!;
}

const onHandOf = async (variantId: string): Promise<number> =>
  (
    await harness.database.d1
      .prepare(`SELECT "onHandQuantity" AS q FROM "inventory_balances" WHERE "variantId" = ?`)
      .bind(variantId)
      .first<{ q: number }>()
  )!.q;

const columnOf = async <T>(sql: string, ...bindings: string[]): Promise<T> =>
  (await harness.database.d1
    .prepare(sql)
    .bind(...bindings)
    .first<T>())!;

/** A variant a shopper is holding, so the reserved-quantity guard has something to bite on. */
async function reservedVariant(quantity = 2): Promise<string> {
  const shopper = harness.client();
  const listing = await shopper.get('/catalog/products?inStock=true&pageSize=24');
  for (const item of listing.body.items) {
    const product = await shopper.get(`/catalog/products/${item.slug}`);
    const variant = product.body.variants.find(
      (v: any) => v.availableQuantity > quantity && v.isEnabled,
    );
    if (!variant) continue;
    const added = await shopper.post('/cart/items', { variantId: variant.id, quantity });
    expect(added.status).toBe(200);
    return variant.id;
  }
  throw new Error('The seed produced no purchasable variant');
}

/** An order that has been paid for, so refunds and documents have something real. */
async function freshPaidOrder(): Promise<string> {
  const shopper = harness.client();
  const listing = await shopper.get('/catalog/products?inStock=true&pageSize=24');
  for (const item of listing.body.items) {
    const product = await shopper.get(`/catalog/products/${item.slug}`);
    const variant = product.body.variants.find((v: any) => v.availableQuantity > 2 && v.isEnabled);
    if (!variant) continue;

    await shopper.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const placed = await shopper.post('/checkout/submit', {
      email: 'sweep@demo.local',
      shippingAddress: {
        firstName: 'Sweep',
        lastName: 'Tester',
        line1: '9 Example Street',
        city: 'Porto',
        postalCode: '4000',
        countryCode: 'PT',
      },
      shippingMethod: 'STANDARD',
    });
    expect(placed.status).toBe(201);
    return placed.body.orderId;
  }
  throw new Error('The seed produced no purchasable variant');
}

// --- Inventory ---------------------------------------------------------------

describe('stock adjustments, all five movement types', () => {
  /*
   * The worst defect of the sweep. `CORRECTION` is the new absolute on-hand
   * figure — what `inventoryAdjustSchema` in packages/validation documents, what
   * the NestJS stack implements, and what the panel's own label promises, since
   * it relabels the field "New on-hand quantity" the moment CORRECTION is
   * picked. The Worker treated it as a decrease and clamped the result at zero,
   * so correcting a variant holding 30 up to 50 set it to 0, wrote a -30 ledger
   * entry, returned 200, and sold the product out.
   */
  it('CORRECTION sets the absolute figure the field asks for', async () => {
    const variant = await freeVariant();
    const target = variant.onHand + 20;

    const { status, body } = await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'CORRECTION',
      quantity: target,
      reason: 'Stock count',
    });

    expect(status).toBe(200);
    expect(body.previousOnHand).toBe(variant.onHand);
    expect(body.newOnHand).toBe(target);
    expect(await onHandOf(variant.id)).toBe(target);
  });

  it('records a CORRECTION upward as a rise in the ledger, not a fall', async () => {
    const variant = await freeVariant();
    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'CORRECTION',
      quantity: variant.onHand + 11,
      reason: 'Counted again',
    });

    const movement = await columnOf<{ change: number; from: number; to: number }>(
      `SELECT "quantityChange" AS change, "previousOnHand" AS "from", "newOnHand" AS "to"
         FROM "inventory_movements"
        WHERE "variantId" = ? AND "type" = 'CORRECTION'
        ORDER BY "createdAt" DESC LIMIT 1`,
      variant.id,
    );
    expect(movement.change).toBe(11);
    expect(movement.to).toBe(movement.from + 11);
  });

  it('CORRECTION to zero is allowed, because "we have none" is a real count', async () => {
    const variant = await freeVariant();
    const { status, body } = await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'CORRECTION',
      quantity: 0,
      reason: 'Sold the last of it offline',
    });
    expect(status).toBe(200);
    expect(body.newOnHand).toBe(0);
  });

  it('RESTOCK and ADJUSTMENT_INCREASE add to what is there', async () => {
    const variant = await freeVariant();
    const before = await onHandOf(variant.id);

    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'RESTOCK',
      quantity: 5,
      reason: 'Delivery',
    });
    expect(await onHandOf(variant.id)).toBe(before + 5);

    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'ADJUSTMENT_INCREASE',
      quantity: 2,
      reason: 'Found in the back',
    });
    expect(await onHandOf(variant.id)).toBe(before + 7);
  });

  it('ADJUSTMENT_DECREASE takes away, and DAMAGED is counted as well as taken', async () => {
    const variant = await freeVariant();
    const before = await onHandOf(variant.id);
    const damagedBefore = await columnOf<{ q: number }>(
      `SELECT "damagedQuantity" AS q FROM "inventory_balances" WHERE "variantId" = ?`,
      variant.id,
    );

    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'ADJUSTMENT_DECREASE',
      quantity: 1,
      reason: 'Miscount',
    });
    expect(await onHandOf(variant.id)).toBe(before - 1);

    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'DAMAGED',
      quantity: 2,
      reason: 'Water damage',
    });
    expect(await onHandOf(variant.id)).toBe(before - 3);
    const damagedAfter = await columnOf<{ q: number }>(
      `SELECT "damagedQuantity" AS q FROM "inventory_balances" WHERE "variantId" = ?`,
      variant.id,
    );
    expect(damagedAfter.q).toBe(damagedBefore.q + 2);
  });

  /*
   * Refused, not clamped. The clamp is what made the CORRECTION defect silent:
   * "take 500 from 30" became "set it to 0" and reported success, so the
   * operator had no way to learn their number had not been used.
   */
  it('refuses a decrease that would go below zero instead of clamping', async () => {
    const variant = await freeVariant();
    const before = await onHandOf(variant.id);

    const { status, body } = await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'ADJUSTMENT_DECREASE',
      quantity: before + 500,
      reason: 'Deliberately too many',
    });

    expect(status).toBe(400);
    expect(body.message).toMatch(/negative/i);
    expect(await onHandOf(variant.id)).toBe(before);
  });

  it('refuses to set stock below what shoppers are already holding', async () => {
    const held = await reservedVariant(2);

    const { status, body } = await admin.post('/admin/inventory/adjust', {
      variantId: held,
      type: 'CORRECTION',
      quantity: 1,
      reason: 'Below the reservation',
    });
    expect(status).toBe(409);
    expect(body.message).toMatch(/reserved/i);
  });

  it('needs at least 1 for a delta movement, where 0 means nothing at all', async () => {
    const variant = await freeVariant();
    const { status } = await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'RESTOCK',
      quantity: 0,
      reason: 'Nothing at all',
    });
    expect(status).toBe(400);
  });

  it('reports an unknown variant rather than failing silently', async () => {
    const { status } = await admin.post('/admin/inventory/adjust', {
      variantId: 'var_does_not_exist',
      type: 'RESTOCK',
      quantity: 1,
      reason: 'Nobody',
    });
    expect(status).toBe(404);
  });

  it('writes an audit row naming the before and after', async () => {
    const variant = await freeVariant();
    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'RESTOCK',
      quantity: 3,
      reason: 'Audited delivery',
    });

    const entry = await columnOf<{ reason: string; after: string }>(
      `SELECT "reason", "after" FROM "audit_logs"
        WHERE "action" = 'inventory.adjust' AND "entityId" = ?
        ORDER BY "createdAt" DESC LIMIT 1`,
      variant.id,
    );
    expect(entry.reason).toBe('Audited delivery');
    expect(JSON.parse(entry.after).onHandQuantity).toBeGreaterThan(0);
  });
});

describe('the stock ledger the inventory screen shows', () => {
  /*
   * "Show movements" asks for `?page=1&pageSize=50` and maps over `data.items`.
   * This route returned a bare array, so `items` was undefined and the `?? []`
   * behind it rendered an empty table — no error, no rows, and no way to read
   * the ledger from the panel at all. The reservations list two screens over had
   * the same bug and was fixed; this one was missed because nothing asserted the
   * shape, only the status.
   */
  it('answers as a paginated envelope, not a bare array', async () => {
    const { status, body } = await admin.get('/admin/inventory/movements?page=1&pageSize=50');

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(false);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(50);
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.totalPages).toBe(Math.ceil(body.total / 50));
  });

  it('carries every column the movements table renders', async () => {
    const row = (await admin.get('/admin/inventory/movements?page=1&pageSize=1')).body.items[0];
    for (const key of [
      'id',
      'variantId',
      'sku',
      'productName',
      'type',
      'quantityChange',
      'previousOnHand',
      'newOnHand',
      'reason',
      'createdAt',
    ]) {
      expect(row).toHaveProperty(key);
    }
  });

  it('honours pageSize and moves the window with page', async () => {
    const first = (await admin.get('/admin/inventory/movements?page=1&pageSize=5')).body;
    const second = (await admin.get('/admin/inventory/movements?page=2&pageSize=5')).body;
    expect(first.items).toHaveLength(5);
    expect(second.items).toHaveLength(5);
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });

  it('filters to one variant when asked', async () => {
    const variant = await freeVariant();
    await admin.post('/admin/inventory/adjust', {
      variantId: variant.id,
      type: 'RESTOCK',
      quantity: 1,
      reason: 'Ledger filter fixture',
    });

    const { body } = await admin.get(`/admin/inventory/movements?variantId=${variant.id}`);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((m: any) => m.variantId === variant.id)).toBe(true);
    expect(body.total).toBe(body.items.length);
  });
});

describe('reservations, as the reservations screen drives them', () => {
  it('cancels a hold and gives the units back to the shop', async () => {
    const variantId = await reservedVariant(1);
    const reservedBefore = await columnOf<{ q: number }>(
      `SELECT "reservedQuantity" AS q FROM "inventory_balances" WHERE "variantId" = ?`,
      variantId,
    );
    expect(reservedBefore.q).toBeGreaterThan(0);

    const active = (
      await admin.get('/admin/inventory/reservations?page=1&pageSize=100&status=ACTIVE')
    ).body;
    const reservation = active.items.find((r: any) => r.status === 'ACTIVE');
    expect(reservation).toBeTruthy();

    const { status } = await admin.post(
      `/admin/inventory/reservations/${reservation.id}/cancel`,
      { reason: 'Cancelled by an administrator' },
    );
    expect(status).toBe(200);

    const after = await columnOf<{ s: string }>(
      `SELECT "status" AS s FROM "inventory_reservations" WHERE "id" = ?`,
      reservation.id,
    );
    expect(after.s).toBe('CANCELLED');
  });

  it('carries the columns the screen renders, filtered by status', async () => {
    const { body } = await admin.get(
      '/admin/inventory/reservations?page=1&pageSize=100&status=CANCELLED',
    );
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.every((r: any) => r.status === 'CANCELLED')).toBe(true);
    for (const row of body.items.slice(0, 1)) {
      for (const key of ['id', 'sku', 'productName', 'quantity', 'status', 'expiresAt']) {
        expect(row).toHaveProperty(key);
      }
    }
  });
});

// --- Categories --------------------------------------------------------------

describe('the category tree the panel edits', () => {
  const uniqueSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

  const categoryBody = (slug: string, parentId: string | null) => ({
    name: 'Sweep Test Category',
    slug,
    pathSegment: slug,
    parentId,
    targetGroup: 'UNISEX' as const,
    sizeChartGroup: null,
    description: null,
    position: 0,
    isActive: true,
  });

  it('creates, renames and deletes a category the way the screen does', async () => {
    const slug = uniqueSlug('sweep-cat');
    const created = await admin.post('/admin/categories', categoryBody(slug, null));
    expect(created.status).toBe(201);
    const id = created.body.id;

    const renamed = await admin.put(`/admin/categories/${id}`, {
      ...categoryBody(slug, null),
      name: 'Sweep Test Renamed',
    });
    expect(renamed.status).toBe(200);

    const listed = (await admin.get('/admin/categories')).body.find((c: any) => c.id === id);
    expect(listed.name).toBe('Sweep Test Renamed');

    expect((await admin.post(`/admin/categories/${id}/delete`, {})).status).toBe(200);
    expect((await admin.get('/admin/categories')).body.some((c: any) => c.id === id)).toBe(false);
  });

  it('hides and unhides a category without deleting anything', async () => {
    const slug = uniqueSlug('sweep-hide');
    const { body } = await admin.post('/admin/categories', categoryBody(slug, null));

    const hidden = await admin.patch(`/admin/categories/${body.id}/visibility`, {
      isActive: false,
    });
    expect(hidden.status).toBe(200);
    expect(hidden.body.isActive).toBe(false);

    const unhidden = await admin.patch(`/admin/categories/${body.id}/visibility`, {
      isActive: true,
    });
    expect(unhidden.body.isActive).toBe(true);

    await admin.post(`/admin/categories/${body.id}/delete`, {});
  });

  it('will not delete a category that still has children', async () => {
    const parent = await admin.post('/admin/categories', categoryBody(uniqueSlug('sweep-p'), null));
    const child = await admin.post(
      '/admin/categories',
      categoryBody(uniqueSlug('sweep-c'), parent.body.id),
    );

    const refused = await admin.post(`/admin/categories/${parent.body.id}/delete`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.details.childCategories).toBe(1);

    await admin.post(`/admin/categories/${child.body.id}/delete`, {});
    expect((await admin.post(`/admin/categories/${parent.body.id}/delete`, {})).status).toBe(200);
  });

  /* A cascade here would orphan products or silently delete a branch, and
   * neither is what somebody pressing delete is asking for. */
  it('will not delete a category products still point at', async () => {
    // The tree arrives nested — departments at the top, subcategories under
    // them — and products hang off the leaves, so this walks down to one.
    const flatten = (nodes: any[]): any[] =>
      nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
    const withProducts = flatten((await admin.get('/admin/categories')).body).find(
      (c: any) => c.directProductCount > 0,
    );
    expect(withProducts).toBeTruthy();

    const refused = await admin.post(`/admin/categories/${withProducts.id}/delete`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.details.products).toBeGreaterThan(0);
  });

  it('refuses to make a category its own parent', async () => {
    const slug = uniqueSlug('sweep-self');
    const created = await admin.post('/admin/categories', categoryBody(slug, null));
    const { status } = await admin.put(`/admin/categories/${created.body.id}`, {
      ...categoryBody(slug, created.body.id),
    });
    expect(status).toBe(400);
    await admin.post(`/admin/categories/${created.body.id}/delete`, {});
  });

  /*
   * `PUT /admin/categories/reorder` has the same shape as `PUT
   * /admin/categories/:id`, so Hono resolves it to the parameterised route and
   * it can only work by being dispatched from inside that handler. Nothing
   * tested that it still is, and a literal route added beside it later would be
   * silently unreachable.
   */
  it('reorders siblings through the collection path', async () => {
    const first = await admin.post('/admin/categories', categoryBody(uniqueSlug('sweep-a'), null));
    const second = await admin.post('/admin/categories', categoryBody(uniqueSlug('sweep-b'), null));

    const { status } = await admin.put('/admin/categories/reorder', {
      parentId: null,
      orderedIds: [second.body.id, first.body.id],
    });
    expect(status).toBe(200);

    const positions = await harness.database.d1
      .prepare(`SELECT "id", "position" FROM "categories" WHERE "id" IN (?, ?)`)
      .bind(first.body.id, second.body.id)
      .all<{ id: string; position: number }>();
    const byId = new Map(positions.results.map((r) => [r.id, r.position]));
    expect(byId.get(second.body.id)).toBeLessThan(byId.get(first.body.id)!);

    await admin.post(`/admin/categories/${first.body.id}/delete`, {});
    await admin.post(`/admin/categories/${second.body.id}/delete`, {});
  });

  it('rejects a slug that is not a slug', async () => {
    const { status } = await admin.post('/admin/categories', {
      ...categoryBody('Not A Slug', null),
    });
    expect(status).toBe(422);
  });
});

// --- Products ----------------------------------------------------------------

describe('the product screen’s remaining actions', () => {
  const someProduct = async () =>
    (await admin.get('/admin/products?page=1&pageSize=1')).body.items[0];

  it('archives a product from the detail screen', async () => {
    const product = await someProduct();
    const { status } = await admin.post(`/admin/products/${product.id}/archive`, {});
    expect(status).toBe(200);
    expect((await admin.get(`/admin/products/${product.id}`)).body.status).toBe('ARCHIVED');

    await admin.put(`/admin/products/${product.id}`, { status: 'ACTIVE' });
  });

  /* A duplicate that went straight onto the storefront under a colliding slug
   * would not be a duplicate: DRAFT, suffixed slug, and no stock — the copy is
   * a template, not inventory that exists. */
  it('duplicates a product as a draft with its own slug and no stock', async () => {
    const product = await someProduct();
    const { status, body } = await admin.post(`/admin/products/${product.id}/duplicate`, {});

    expect(status).toBe(201);
    expect(body.slug).not.toBe(product.slug);
    expect(body.slug).toContain('-copy');

    const copy = (await admin.get(`/admin/products/${body.id}`)).body;
    expect(copy.status).toBe('DRAFT');
    expect(copy.name).toContain('(copy)');
    expect(copy.variants.length).toBeGreaterThan(0);
    for (const variant of copy.variants) {
      expect(variant.onHandQuantity).toBe(0);
    }
  });

  it('duplicating twice does not collide on the slug', async () => {
    const product = await someProduct();
    const first = await admin.post(`/admin/products/${product.id}/duplicate`, {});
    const second = await admin.post(`/admin/products/${product.id}/duplicate`, {});
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.slug).not.toBe(first.body.slug);
  });

  it('adds a variant with its opening stock and ledger entry', async () => {
    const product = await someProduct();
    const sku = `SWEEP-VAR-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const { status, body } = await admin.post(`/admin/products/${product.id}/variants`, {
      sku,
      size: 'XL',
      color: 'Slate',
      barcode: null,
      priceOverrideMinor: null,
      initialQuantity: 4,
    });
    expect(status).toBe(201);

    expect(await onHandOf(body.id)).toBe(4);
    const opening = await columnOf<{ type: string; change: number }>(
      `SELECT "type", "quantityChange" AS change FROM "inventory_movements" WHERE "variantId" = ?`,
      body.id,
    );
    expect(opening.type).toBe('INITIAL');
    expect(opening.change).toBe(4);
  });

  it('enables and disables a variant from the detail screen', async () => {
    const product = (await admin.get(`/admin/products/${(await someProduct()).id}`)).body;
    const variant = product.variants[0];

    expect(
      (await admin.patch(`/admin/variants/${variant.id}/enabled`, { isEnabled: false })).status,
    ).toBe(200);
    expect(
      (
        await columnOf<{ e: number }>(
          `SELECT "isEnabled" AS e FROM "product_variants" WHERE "id" = ?`,
          variant.id,
        )
      ).e,
    ).toBe(0);

    expect(
      (await admin.patch(`/admin/variants/${variant.id}/enabled`, { isEnabled: true })).status,
    ).toBe(200);
  });

  it('reports an unknown variant rather than pretending to have switched it', async () => {
    const { status } = await admin.patch('/admin/variants/var_nope/enabled', { isEnabled: false });
    expect(status).toBe(404);
  });

  /*
   * The whole image path in one case, because the panel does it in one gesture:
   * upload the file, post the `/media/…` URL the upload returned, then remove it
   * again. Posting that URL straight back is what used to be rejected with
   * "upload the file first" — a 400 on the one value this API had just handed out.
   */
  it('uploads an image, attaches it, and removes it again', async () => {
    const product = await someProduct();
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);

    const uploaded = await admin.upload('/admin/uploads', {
      bytes: png,
      type: 'image/png',
      name: 'sweep.png',
    });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.url).toContain('/media/uploads/');

    const attached = await admin.post(`/admin/products/${product.id}/images`, {
      url: uploaded.body.url,
      objectKey: uploaded.body.objectKey,
      altText: 'A sweep test image',
      variantId: null,
    });
    expect(attached.status).toBe(201);

    const withImage = (await admin.get(`/admin/products/${product.id}`)).body;
    expect(withImage.images.some((i: any) => i.id === attached.body.id)).toBe(true);

    const removed = await admin.delete(`/admin/products/${product.id}/images/${attached.body.id}`);
    expect(removed.status).toBe(200);
    const without = (await admin.get(`/admin/products/${product.id}`)).body;
    expect(without.images.some((i: any) => i.id === attached.body.id)).toBe(false);
  });

  it('will not delete an image through a product it does not belong to', async () => {
    const products = (await admin.get('/admin/products?page=1&pageSize=2')).body.items;
    const owner = (await admin.get(`/admin/products/${products[0].id}`)).body;
    const image = owner.images[0];
    expect(image).toBeTruthy();

    const { status } = await admin.delete(`/admin/products/${products[1].id}/images/${image.id}`);
    expect(status).toBe(404);
  });

  /*
   * The search box has always said "Search by name, slug, or SKU", and the query
   * matched name, slug and brand. A SKU is what an operator has in hand when
   * they are holding the garment or reading a packing list, so it is the
   * likeliest thing typed here — and every one of those searches came back empty.
   */
  it('finds a product by a variant SKU, as the search box promises', async () => {
    const variant = await freeVariant();
    const { body } = await admin.get(
      `/admin/products?page=1&pageSize=25&q=${encodeURIComponent(variant.sku)}`,
    );

    expect(body.total).toBeGreaterThan(0);
    const found = body.items.some((p: any) =>
      p.variants.some((v: any) => v.sku === variant.sku),
    );
    expect(found).toBe(true);
  });

  it('still finds a product by name and by slug', async () => {
    const product = await (async () => (await admin.get('/admin/products?page=1&pageSize=1')).body.items[0])();
    const byName = await admin.get(
      `/admin/products?page=1&pageSize=25&q=${encodeURIComponent(product.name.split(' ')[0])}`,
    );
    expect(byName.body.total).toBeGreaterThan(0);

    const bySlug = await admin.get(
      `/admin/products?page=1&pageSize=25&q=${encodeURIComponent(product.slug)}`,
    );
    expect(bySlug.body.total).toBeGreaterThan(0);
  });
});

// --- CSV ---------------------------------------------------------------------

describe('the products CSV round trip', () => {
  /*
   * Export and import are one feature with two buttons, and the two disagreed.
   * The export did not exist on this backend at all, and the import was a
   * two-column stock importer (`sku,quantity`) that created nothing — so the
   * panel's "Imported N variants" described work no code here did, and a file
   * from the export could not be read back in.
   */
  it('exports the columns the importer reads', async () => {
    const { status, body, response } = await admin.get('/admin/products/export/csv');
    expect(status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('products.csv');

    // The client reads the body once; for a non-JSON response it hands back the
    // raw text, so this is the CSV itself rather than a second read.
    const [header, ...rows] = String(body).split(/\r?\n/);
    expect(header.split(',')).toEqual([
      'productSlug',
      'productName',
      'brandSlug',
      'categorySlug',
      'status',
      'originalPriceMinor',
      'outletPriceMinor',
      'sku',
      'size',
      'color',
      'onHandQuantity',
      'reservedQuantity',
      'isEnabled',
    ]);
    expect(rows.length).toBeGreaterThan(100);
  });

  it('re-imports its own export without creating a duplicate', async () => {
    const csv = String((await admin.get('/admin/products/export/csv')).body);
    const { status, body } = await admin.post('/admin/products/import/csv', { csv });

    expect(status).toBe(200);
    // Every SKU in the file already exists, so every row is skipped by design:
    // stock moves through audited adjustments, never a silent overwrite.
    expect(body.created).toBe(0);
    expect(body.skipped).toBeGreaterThan(100);
  });

  /*
   * The transport limit is the reason this case exists. A JSON body was capped
   * at 64 KB and the products export is around 500 KB, so exporting the
   * catalogue, editing it and importing it back — the round trip those two
   * buttons are for — failed with 413 before any handler ran.
   */
  it('accepts a file far larger than the ordinary JSON body limit', async () => {
    const csv = String((await admin.get('/admin/products/export/csv')).body);
    expect(csv.length).toBeGreaterThan(64 * 1024);
    expect((await admin.post('/admin/products/import/csv', { csv })).status).toBe(200);
  });

  it('creates a product and variant from a new row, as a draft', async () => {
    const brand = (await admin.get('/admin/brands')).body[0];
    const sku = `SWEEP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const csv = [
      'productSlug,productName,brandSlug,categorySlug,status,originalPriceMinor,outletPriceMinor,sku,size,color,onHandQuantity,reservedQuantity,isEnabled',
      // A comma inside a quoted name, because that is the ordinary case for a
      // product title and an unquoted split shifts every column after it.
      `sweep-import-${sku.toLowerCase()},"Sweep Jacket, quilted",${brand.slug},,DRAFT,9900,4900,${sku},M,Navy,7,0,true`,
    ].join('\n');

    const { status, body } = await admin.post('/admin/products/import/csv', { csv });
    expect(status).toBe(200);
    expect(body).toEqual({ created: 1, skipped: 0 });

    const found = (await admin.get(`/admin/products?page=1&pageSize=5&q=${sku}`)).body.items[0];
    expect(found.name).toBe('Sweep Jacket, quilted');
    // Never published by an import; somebody decides that.
    expect(found.status).toBe('DRAFT');
    expect(found.variants[0].sku).toBe(sku);
    expect(found.variants[0].inventory.onHandQuantity).toBe(7);  // list view nests it
  });

  it('puts two rows of one product under a single product', async () => {
    const brand = (await admin.get('/admin/brands')).body[0];
    const stem = Math.random().toString(36).slice(2, 7).toUpperCase();
    const csv = [
      'productSlug,productName,brandSlug,sku,size,onHandQuantity',
      `sweep-two-${stem.toLowerCase()},Sweep Two Sizes,${brand.slug},SWEEP-${stem}-S,S,2`,
      `sweep-two-${stem.toLowerCase()},Sweep Two Sizes,${brand.slug},SWEEP-${stem}-M,M,3`,
    ].join('\n');

    const { body } = await admin.post('/admin/products/import/csv', { csv });
    expect(body).toEqual({ created: 2, skipped: 0 });

    const found = (await admin.get(`/admin/products?page=1&pageSize=5&q=SWEEP-${stem}`)).body;
    expect(found.total).toBe(1);
    expect(found.items[0].variants).toHaveLength(2);
  });

  it('leaves an existing product alone rather than overwriting it from a spreadsheet', async () => {
    const product = (await admin.get('/admin/products?page=1&pageSize=1')).body.items[0];
    const brand = (await admin.get('/admin/brands')).body[0];
    const sku = `SWEEP-EXIST-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const csv = [
      'productSlug,productName,brandSlug,sku,onHandQuantity',
      `${product.slug},Renamed By A Spreadsheet,${brand.slug},${sku},1`,
    ].join('\n');

    expect((await admin.post('/admin/products/import/csv', { csv })).body).toEqual({
      created: 1,
      skipped: 0,
    });
    // The new variant landed on the existing product; the product itself did not
    // change its name, price or status.
    const reloaded = (await admin.get(`/admin/products/${product.id}`)).body;
    expect(reloaded.name).toBe(product.name);
    expect(reloaded.variants.some((v: any) => v.sku === sku)).toBe(true);
  });

  it('skips a row naming a brand that does not exist, and says how many', async () => {
    const csv = [
      'productSlug,productName,brandSlug,sku',
      'sweep-unknown-brand,Nobody,no-such-brand-at-all,SWEEP-NOBODY-1',
    ].join('\n');
    const { status, body } = await admin.post('/admin/products/import/csv', { csv });
    expect(status).toBe(200);
    expect(body).toEqual({ created: 0, skipped: 1 });
  });

  it('refuses a file missing a column it cannot work without', async () => {
    const { status, body } = await admin.post('/admin/products/import/csv', {
      // Everything but the SKU, so the message has to name the one that is gone.
      csv: 'productSlug,productName,brandSlug\nsweep-no-sku,No SKU Here,aster',
    });
    expect(status).toBe(400);
    expect(body.message).toContain('sku');
  });

  it('refuses a file with a header and nothing under it', async () => {
    const { status } = await admin.post('/admin/products/import/csv', {
      csv: 'productSlug,productName,brandSlug,sku',
    });
    expect(status).toBe(400);
  });

  /*
   * The button is on the Products screen, and this required the *inventory*
   * permission — so a Catalog Manager was refused by a button on their own
   * screen, while the only role allowed could not open that screen at all.
   */
  it('is allowed to a Catalog Manager, whose screen the button is on', async () => {
    const catalog = harness.client();
    await catalog.post('/auth/login', {
      email: 'catalog@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });

    const brand = (await admin.get('/admin/brands')).body[0];
    const sku = `SWEEP-CAT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const { status } = await catalog.post('/admin/products/import/csv', {
      csv: [
        'productSlug,productName,brandSlug,sku',
        `sweep-catalog-${sku.toLowerCase()},Catalog Manager Import,${brand.slug},${sku}`,
      ].join('\n'),
    });
    expect(status).toBe(200);
  });

  it('is refused to a role that manages stock but not the catalogue', async () => {
    const inventory = harness.client();
    await inventory.post('/auth/login', {
      email: 'inventory@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    const { status } = await inventory.post('/admin/products/import/csv', {
      csv: 'productSlug,productName,brandSlug,sku\na,b,c,d',
    });
    expect(status).toBe(403);
  });

  it('exports inventory as its own report', async () => {
    const { status, body, response } = await admin.get('/admin/inventory/export/csv');
    expect(status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');

    const [header, first] = String(body).split(/\r?\n/);
    expect(header.split(',')).toEqual([
      'sku',
      'productSlug',
      'onHandQuantity',
      'reservedQuantity',
      'availableQuantity',
      'soldQuantity',
      'damagedQuantity',
      'returnedQuantity',
    ]);
    expect(first.split(',')).toHaveLength(8);
  });

  it('refuses both exports to a caller with no session', async () => {
    const stranger = harness.client();
    expect((await stranger.get('/admin/products/export/csv')).status).toBe(401);
    expect((await stranger.get('/admin/inventory/export/csv')).status).toBe(401);
  });
});

// --- Printable documents -----------------------------------------------------

describe('the printable documents on the order screen', () => {
  /*
   * Invoice and Packing slip are plain `<a href>` links, which is how they went
   * unnoticed: an audit of the panel's fetch client cannot see them, and both
   * landed on the Worker's notFound handler. Clicking either navigated the
   * operator's tab to `{"code":"NOT_FOUND","message":"No such endpoint."}`.
   */
  const someOrder = async () => (await admin.get('/admin/orders?page=1&pageSize=1')).body.items[0];

  it('renders an invoice with the order and its totals', async () => {
    const order = await someOrder();
    const { status, body, response } = await admin.get(`/admin/orders/${order.id}/invoice`);

    expect(status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = String(body);
    expect(html).toContain(order.orderNumber);
    expect(html).toContain('INVOICE');
    expect(html).toContain('Total');
    expect(html).toContain('Included VAT');
  });

  it('renders a packing slip with no prices on it', async () => {
    const order = await someOrder();
    const html = String((await admin.get(`/admin/orders/${order.id}/packing-slip`)).body);

    expect(html).toContain('PACKING SLIP');
    expect(html).toContain(order.orderNumber);
    // A warehouse picking an order is not handed the customer's financials.
    expect(html).not.toContain('Included VAT');
    expect(html).not.toContain('Subtotal');
  });

  it('lists the items being shipped', async () => {
    const order = await someOrder();
    const detail = (await admin.get(`/admin/orders/${order.id}`)).body;
    const html = String((await admin.get(`/admin/orders/${order.id}/packing-slip`)).body);

    for (const item of detail.items) {
      expect(html).toContain(item.sku);
    }
  });

  /* The JSON API's policy is `default-src 'none'`, which would refuse the
   * document's own stylesheet and print an unformatted invoice. */
  it('serves the document under a policy that allows its own stylesheet', async () => {
    const order = await someOrder();
    const { body, response } = await admin.get(`/admin/orders/${order.id}/invoice`);
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain("style-src 'unsafe-inline'");
    // And still no script, anywhere: these documents contain none.
    expect(csp).not.toContain('script-src');
    expect(String(body)).not.toContain('<script');
  });

  it('still sends the ordinary strict policy with the JSON API', async () => {
    const { response } = await admin.get('/admin/dashboard');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).not.toContain('style-src');
  });

  it('escapes what it interpolates', async () => {
    const orderId = await freshPaidOrder();
    await harness.database.d1
      .prepare(`UPDATE "orders" SET "email" = ? WHERE "id" = ?`)
      .bind('<script>alert(1)</script>@demo.local', orderId)
      .run();

    const html = String((await admin.get(`/admin/orders/${orderId}/invoice`)).body);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('reports an unknown order rather than rendering an empty document', async () => {
    expect((await admin.get('/admin/orders/ord_nope/invoice')).status).toBe(404);
    expect((await admin.get('/admin/orders/ord_nope/packing-slip')).status).toBe(404);
  });

  it('refuses both documents to a caller with no session', async () => {
    const order = await someOrder();
    const stranger = harness.client();
    expect((await stranger.get(`/admin/orders/${order.id}/invoice`)).status).toBe(401);
    expect((await stranger.get(`/admin/orders/${order.id}/packing-slip`)).status).toBe(401);
  });
});

// --- Reviews -----------------------------------------------------------------

describe('moderating reviews in bulk', () => {
  const someReviews = async (count: number): Promise<string[]> =>
    (await admin.get(`/admin/reviews?page=1&pageSize=${count}`)).body.items.map((r: any) => r.id);

  const statusOf = async (id: string): Promise<string> =>
    (
      await columnOf<{ s: string }>(
        `SELECT "status" AS s FROM "product_reviews" WHERE "id" = ?`,
        id,
      )
    ).s;

  /*
   * The bulk bar offers six actions and this endpoint accepted four. `delete`
   * and `clearReports` — both named in `reviewBulkSchema` in
   * packages/validation, both implemented by the NestJS stack — came back 422,
   * so two of the panel's own buttons were dead on the deployed demo.
   */
  it.each([
    ['publish', 'PUBLISHED'],
    ['hide', 'HIDDEN'],
    ['reject', 'REJECTED'],
    ['pending', 'PENDING'],
  ])('applies "%s" to a selection', async (action, expected) => {
    const ids = await someReviews(2);
    const { status, body } = await admin.post('/admin/reviews/bulk', { ids, action });

    expect(status).toBe(200);
    expect(body.count).toBe(ids.length);
    for (const id of ids) expect(await statusOf(id)).toBe(expected);
  });

  it('clears the report flags without touching status or rating', async () => {
    const ids = await someReviews(1);
    await admin.post('/admin/reviews/bulk', { ids, action: 'publish' });
    await harness.database.d1
      .prepare(`UPDATE "product_reviews" SET "reportCount" = 3, "reportedAt" = ? WHERE "id" = ?`)
      .bind(new Date().toISOString(), ids[0])
      .run();

    const { status, body } = await admin.post('/admin/reviews/bulk', {
      ids,
      action: 'clearReports',
    });
    expect(status).toBe(200);
    expect(body.count).toBe(1);

    const row = await columnOf<{ c: number; a: string | null; s: string }>(
      `SELECT "reportCount" AS c, "reportedAt" AS a, "status" AS s
         FROM "product_reviews" WHERE "id" = ?`,
      ids[0],
    );
    expect(row.c).toBe(0);
    expect(row.a).toBeNull();
    expect(row.s).toBe('PUBLISHED');
  });

  it('deletes a selection and recomputes the products’ ratings', async () => {
    const review = (await admin.get('/admin/reviews?page=1&pageSize=1&status=PUBLISHED')).body
      .items[0];
    expect(review).toBeTruthy();

    const { status, body } = await admin.post('/admin/reviews/bulk', {
      ids: [review.id],
      action: 'delete',
    });
    expect(status).toBe(200);
    expect(body.count).toBe(1);

    const gone = await columnOf<{ c: number }>(
      `SELECT COUNT(*) AS c FROM "product_reviews" WHERE "id" = ?`,
      review.id,
    );
    expect(gone.c).toBe(0);

    // The aggregate the storefront reads is recomputed from what is left, not
    // left describing a review that no longer exists.
    const product = await columnOf<{ rc: number; actual: number }>(
      `SELECT p."reviewCount" AS rc,
              (SELECT COUNT(*) FROM "product_reviews"
                WHERE "productId" = p."id" AND "status" = 'PUBLISHED') AS actual
         FROM "products" p WHERE p."id" = ?`,
      review.product.id,
    );
    expect(product.rc).toBe(product.actual);
  });

  it('reports ids that matched nothing rather than claiming to have updated them', async () => {
    const { status } = await admin.post('/admin/reviews/bulk', {
      ids: ['rev_not_a_real_review'],
      action: 'publish',
    });
    expect(status).toBe(404);
  });

  it('counts what it actually changed, not what was asked for', async () => {
    const ids = await someReviews(1);
    const { body } = await admin.post('/admin/reviews/bulk', {
      ids: [...ids, 'rev_not_a_real_review'],
      action: 'publish',
    });
    expect(body.count).toBe(1);
    expect(body.ids).toEqual(ids);
  });

  it('rejects an action that is not one of the six', async () => {
    const ids = await someReviews(1);
    const { status } = await admin.post('/admin/reviews/bulk', { ids, action: 'incinerate' });
    expect(status).toBe(422);
  });

  /*
   * Moderation must not become a way to delete. A role holding
   * `reviews.moderate` without `reviews.delete` may publish and hide all day and
   * is refused here — the NestJS stack checks this, and a bulk endpoint is
   * exactly where its absence would go unnoticed.
   *
   * No seeded role has that combination, so one is built here. Permissions are
   * read from the database, so this is the same path a hand-made role takes.
   */
  it('refuses bulk delete to a moderator who cannot delete reviews', async () => {
    const registered = await harness.client().post('/auth/register', {
      email: 'narrow.moderator@demo.local',
      password: 'narrow-moderator-password-1a2b',
      firstName: 'Narrow',
      lastName: 'Moderator',
      newsletterOptIn: false,
    });
    expect(registered.status).toBe(201);

    await harness.database.d1
      .prepare(`INSERT INTO "roles" ("id", "name", "description") VALUES (?, ?, ?)`)
      .bind('role_sweep_mod', 'Sweep Moderator', 'Moderates but cannot delete')
      .run();
    for (const key of ['reviews.view', 'reviews.moderate']) {
      await harness.database.d1
        .prepare(
          `INSERT INTO "role_permissions" ("roleId", "permissionId")
           SELECT ?, "id" FROM "permissions" WHERE "key" = ?`,
        )
        .bind('role_sweep_mod', key)
        .run();
    }
    await harness.database.d1
      .prepare(`INSERT INTO "user_roles" ("userId", "roleId") VALUES (?, ?)`)
      .bind(registered.body.id, 'role_sweep_mod')
      .run();

    const moderator = harness.client();
    await moderator.post('/auth/login', {
      email: 'narrow.moderator@demo.local',
      password: 'narrow-moderator-password-1a2b',
    });
    const ids = await someReviews(1);

    // Moderation itself still works for them.
    expect((await moderator.post('/admin/reviews/bulk', { ids, action: 'publish' })).status).toBe(
      200,
    );

    const refused = await moderator.post('/admin/reviews/bulk', { ids, action: 'delete' });
    expect(refused.status).toBe(403);
    expect(refused.body.message).toContain('reviews.delete');
    // And the review is still there.
    expect(
      (
        await columnOf<{ c: number }>(
          `SELECT COUNT(*) AS c FROM "product_reviews" WHERE "id" = ?`,
          ids[0],
        )
      ).c,
    ).toBe(1);
  });

  it('moderates a single review the way the row menu does', async () => {
    const ids = await someReviews(1);
    const { status, body } = await admin.post(`/admin/reviews/${ids[0]}/status`, {
      status: 'HIDDEN',
      note: 'Off topic',
    });
    expect(status).toBe(200);
    expect(body.status).toBe('HIDDEN');

    const row = await columnOf<{ s: string; n: string }>(
      `SELECT "status" AS s, "moderationNote" AS n FROM "product_reviews" WHERE "id" = ?`,
      ids[0],
    );
    expect(row.s).toBe('HIDDEN');
    expect(row.n).toBe('Off topic');
  });

  it('reports an unknown review rather than moderating nothing', async () => {
    const { status } = await admin.post('/admin/reviews/rev_nope/status', { status: 'HIDDEN' });
    expect(status).toBe(404);
  });

  it('reports the queue as the maps the header indexes', async () => {
    const { status, body } = await admin.get('/admin/reviews/stats?page=1&pageSize=25');
    expect(status).toBe(200);
    // The tabs index statusCounts[tab] and the histogram indexes
    // distribution['5']; a flat SUM row threw on Object.values(undefined).
    for (const key of ['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN']) {
      expect(typeof body.statusCounts[key]).toBe('number');
    }
    for (const rating of ['1', '2', '3', '4', '5']) {
      expect(typeof body.distribution[rating]).toBe('number');
    }
    expect(typeof body.total).toBe('number');
    expect(typeof body.reported).toBe('number');
    expect(typeof body.unanswered).toBe('number');
  });
});

// --- Customers ---------------------------------------------------------------

describe('customer support actions', () => {
  it('disables an account, ends its live sessions, and enables it again', async () => {
    const customer = harness.client();
    await customer.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    expect((await customer.get('/auth/me')).body.user).toBeTruthy();

    const row = (await admin.get('/admin/customers?page=1&pageSize=50')).body.items.find(
      (c: any) => c.email === 'customer@demo.local',
    );
    const disabled = await admin.post(`/admin/customers/${row.id}/disable`, {
      reason: 'Chargeback investigation',
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.status).toBe('DISABLED');

    // Their session ends now, not when it would have expired.
    expect((await customer.get('/auth/me')).body.user).toBeNull();
    expect(
      (
        await harness.client().post('/auth/login', {
          email: 'customer@demo.local',
          password: TEST_CUSTOMER_PASSWORD,
        })
      ).status,
    ).not.toBe(200);

    const enabled = await admin.post(`/admin/customers/${row.id}/enable`, {});
    expect(enabled.status).toBe(200);
    expect(enabled.body.status).toBe('ACTIVE');
    expect(
      (
        await harness.client().post('/auth/login', {
          email: 'customer@demo.local',
          password: TEST_CUSTOMER_PASSWORD,
        })
      ).status,
    ).toBe(200);
  });

  it('records the reason on the account and in the audit log', async () => {
    const target = (await admin.get('/admin/customers?page=1&pageSize=50')).body.items.find(
      (c: any) => c.email === 'jonas.weber@demo.local',
    );
    expect(target).toBeTruthy();

    await admin.post(`/admin/customers/${target.id}/disable`, { reason: 'Fraud review' });
    const row = await columnOf<{ r: string }>(
      `SELECT "disabledReason" AS r FROM "users" WHERE "id" = ?`,
      target.id,
    );
    expect(row.r).toBe('Fraud review');

    const entry = await columnOf<{ reason: string }>(
      `SELECT "reason" FROM "audit_logs"
        WHERE "action" = 'customer.disable' AND "entityId" = ?
        ORDER BY "createdAt" DESC LIMIT 1`,
      target.id,
    );
    expect(entry.reason).toBe('Fraud review');

    await admin.post(`/admin/customers/${target.id}/enable`, {});
  });

  /* Disabling yourself would lock the panel with nobody able to undo it. */
  it('refuses to let an administrator disable their own account', async () => {
    const me = (await admin.get('/auth/me')).body.user;
    const { status } = await admin.post(`/admin/customers/${me.id}/disable`, { reason: 'Oops' });
    expect(status).toBe(400);
    expect((await admin.get('/auth/me')).body.user).toBeTruthy();
  });

  it('reports an unknown customer rather than disabling nobody', async () => {
    expect((await admin.post('/admin/customers/usr_nope/disable', { reason: 'x' })).status).toBe(
      404,
    );
    expect((await admin.post('/admin/customers/usr_nope/enable', {})).status).toBe(404);
  });

  /*
   * The dashboard's low-stock tile, which is what the setting on the Content &
   * Settings screen is for.
   *
   * Both queries behind it hardcoded 5, so saving a new threshold changed
   * nothing and the field looked broken — and they disagreed with each other:
   * the tile counted `BETWEEN 1 AND 5` while the list under it selected
   * `BETWEEN 0 AND 5`, so the headline number excluded exactly the sold-out rows
   * the list was full of.
   */
  it('counts low stock at the threshold the administrator saved', async () => {
    const at = async (threshold: number) => {
      expect((await admin.put('/admin/settings/lowStockThreshold', { value: threshold })).status)
        .toBe(200);
      return (await admin.get('/admin/dashboard')).body;
    };

    const none = await at(0);
    const some = await at(5);
    const many = await at(50);

    // A bigger threshold cannot mean fewer low-stock rows.
    expect(some.lowStockCount).toBeGreaterThan(none.lowStockCount);
    expect(many.lowStockCount).toBeGreaterThan(some.lowStockCount);

    // And the tile agrees with the list beneath it: every row listed is at or
    // below the threshold the count was computed from.
    for (const row of many.lowStockVariants) {
      expect(row.availableQuantity).toBeLessThanOrEqual(50);
    }
    await admin.put('/admin/settings/lowStockThreshold', { value: 5 });
  });

  it('filters the inventory screen by the same threshold', async () => {
    await admin.put('/admin/settings/lowStockThreshold', { value: 0 });
    const strict = (await admin.get('/admin/inventory?page=1&pageSize=100&lowStock=true')).body;
    await admin.put('/admin/settings/lowStockThreshold', { value: 50 });
    const loose = (await admin.get('/admin/inventory?page=1&pageSize=100&lowStock=true')).body;

    expect(loose.total).toBeGreaterThan(strict.total);
    await admin.put('/admin/settings/lowStockThreshold', { value: 5 });
  });
});

describe('support notes', () => {
  it('adds a support note to a customer', async () => {
    const customer = (await admin.get('/admin/customers?page=1&pageSize=50')).body.items.find(
      (c: any) => c.email !== 'admin@demo.local',
    );
    const { status } = await admin.post(`/admin/customers/${customer.id}/notes`, {
      note: 'Called about a late delivery.',
    });
    // The form sends `{ note }`, and this route parsed `{ internalNote }` — the
    // *order* note's vocabulary — so every note an agent typed came back 422.
    expect(status).toBe(201);

    const detail = (await admin.get(`/admin/customers/${customer.id}`)).body;
    expect(JSON.stringify(detail)).toContain('Called about a late delivery.');
  });

  /*
   * The list binds to `note.author?.email` and falls back to "unknown", so a
   * flat `authorEmail` attributed every note on every customer to nobody —
   * which is most of the point of keeping notes.
   */
  it('names the agent who wrote it, nested as the screen reads it', async () => {
    const customer = (await admin.get('/admin/customers?page=1&pageSize=50')).body.items.find(
      (c: any) => c.email !== 'admin@demo.local',
    );
    await admin.post(`/admin/customers/${customer.id}/notes`, { note: 'Who wrote this?' });

    const note = (await admin.get(`/admin/customers/${customer.id}`)).body.supportNotes[0];
    expect(note.author).toEqual({ email: 'admin@demo.local' });
    // The flat column stays for anything reading it by that name.
    expect(note.authorEmail).toBe('admin@demo.local');
  });

  it('still accepts the older { internalNote } shape', async () => {
    const customer = (await admin.get('/admin/customers?page=1&pageSize=50')).body.items.find(
      (c: any) => c.email !== 'admin@demo.local',
    );
    const { status } = await admin.post(`/admin/customers/${customer.id}/notes`, {
      internalNote: 'Written the old way.',
    });
    expect(status).toBe(201);
  });

  it('refuses an empty note rather than storing a blank row', async () => {
    const customer = (await admin.get('/admin/customers?page=1&pageSize=50')).body.items.find(
      (c: any) => c.email !== 'admin@demo.local',
    );
    expect((await admin.post(`/admin/customers/${customer.id}/notes`, {})).status).toBe(422);
  });
});

// --- Money -------------------------------------------------------------------

describe('money the panel can send back', () => {
  it('refunds against an order from the refund form', async () => {
    const orderId = await freshPaidOrder();
    const before = (await admin.get(`/admin/orders/${orderId}`)).body;

    const { status, body } = await admin.post('/admin/orders/refunds', {
      orderId,
      amountMinor: 100,
      reason: 'Goodwill',
    });
    expect(status).toBe(201);
    expect(body.amountMinor).toBe(100);
    expect(body.status).toBe('SUCCEEDED');
    expect(body.demo).toBe(true);

    const after = (await admin.get(`/admin/orders/${orderId}`)).body;
    expect(after.refunds.length).toBe(before.refunds.length + 1);
  });

  it('will not refund more than is left on the payment', async () => {
    const orderId = await freshPaidOrder();
    const detail = (await admin.get(`/admin/orders/${orderId}`)).body;

    const { status, body } = await admin.post('/admin/orders/refunds', {
      orderId,
      amountMinor: detail.totalMinor + 10_000,
      reason: 'Too much',
    });
    expect(status).toBe(409);
    expect(body.details.remainingMinor).toBeGreaterThan(0);
  });

  it('will not refund an order that was never paid for', async () => {
    const { status } = await admin.post('/admin/orders/refunds', {
      orderId: 'ord_nope',
      amountMinor: 100,
      reason: 'Nothing there',
    });
    expect(status).toBe(404);
  });

  it('completes a received return, which is when the refund happens', async () => {
    const open = (await admin.get('/admin/returns')).body.find(
      (r: any) => r.status === 'REQUESTED' || r.status === 'APPROVED',
    );
    expect(open).toBeTruthy();

    if (open.status === 'REQUESTED') {
      expect(
        (await admin.post(`/admin/returns/${open.id}/decision`, { decision: 'APPROVED' })).status,
      ).toBe(200);
    }

    // Not before it has been received: that is the step that puts the goods back.
    expect((await admin.post(`/admin/returns/${open.id}/complete`, {})).status).toBe(409);

    const detail = (await admin.get(`/admin/returns/${open.id}`)).body;
    await admin.post(`/admin/returns/${open.id}/receive`, {
      items: detail.items.map((item: any) => ({
        returnItemId: item.id,
        receivedQuantity: item.quantity,
        condition: 'RESELLABLE',
        restock: true,
      })),
    });

    const { status } = await admin.post(`/admin/returns/${open.id}/complete`, {});
    expect(status).toBe(200);

    const completed = (await admin.get(`/admin/returns/${open.id}`)).body;
    expect(completed.status).toBe('COMPLETED');

    // A refund exists against the order, with an id that looks simulated.
    const refund = await columnOf<{ id: string; provider: string; amount: number }>(
      `SELECT "id", "providerRefundId" AS provider, "amountMinor" AS amount
         FROM "refunds" WHERE "returnRequestId" = ?`,
      open.id,
    );
    expect(refund.provider).toContain('SIM-REF-');
    expect(refund.amount).toBeGreaterThan(0);
  });

  it('refuses to complete the same return twice', async () => {
    const completed = (await admin.get('/admin/returns')).body.find(
      (r: any) => r.status === 'COMPLETED',
    );
    if (!completed) return;
    expect((await admin.post(`/admin/returns/${completed.id}/complete`, {})).status).toBe(409);
  });

  /*
   * "Resend confirmation" in an environment with no email provider: it writes
   * the notification the customer would have been emailed and says so. Silently
   * succeeding while sending nothing would be worse than the button not existing.
   */
  it('resends a confirmation to a customer’s inbox, and says it sent no email', async () => {
    const shopper = harness.client();
    await shopper.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });
    const listing = await shopper.get('/catalog/products?inStock=true&pageSize=24');
    let orderId: string | null = null;
    for (const item of listing.body.items) {
      const product = await shopper.get(`/catalog/products/${item.slug}`);
      const variant = product.body.variants.find(
        (v: any) => v.availableQuantity > 2 && v.isEnabled,
      );
      if (!variant) continue;
      await shopper.post('/cart/items', { variantId: variant.id, quantity: 1 });
      const placed = await shopper.post('/checkout/submit', {
        email: 'customer@demo.local',
        shippingAddress: {
          firstName: 'Signed',
          lastName: 'In',
          line1: '1 Example Street',
          city: 'Porto',
          postalCode: '4000',
          countryCode: 'PT',
        },
        shippingMethod: 'STANDARD',
      });
      expect(placed.status).toBe(201);
      orderId = placed.body.orderId;
      break;
    }
    expect(orderId).toBeTruthy();

    const before = (await shopper.get('/account/inbox')).body;
    const { status, body } = await admin.post(
      `/admin/orders/${orderId}/resend-confirmation`,
      {},
    );
    expect(status).toBe(200);
    expect(body.delivered).toBe('in-app');
    expect(body.email).toBe(false);

    const after = (await shopper.get('/account/inbox')).body;
    const count = (page: any) => (Array.isArray(page) ? page.length : page.items.length);
    expect(count(after)).toBeGreaterThan(count(before));
  });

  it('says plainly that a guest order has no inbox to send to', async () => {
    const orderId = await freshPaidOrder();
    const { status, body } = await admin.post(
      `/admin/orders/${orderId}/resend-confirmation`,
      {},
    );
    expect(status).toBe(409);
    expect(body.message).toContain('guest');
  });
});

// --- Settings, media, verification -------------------------------------------

describe('the settings and media screens’ remaining endpoints', () => {
  it('saves a single setting through its own path', async () => {
    const { status } = await admin.put('/admin/settings/lowStockThreshold', { value: 7 });
    expect(status).toBe(200);
    expect((await admin.get('/admin/settings')).body.lowStockThreshold).toBe(7);
  });

  it('lists promotions for the campaigns screen', async () => {
    const { status, body } = await admin.get('/admin/promotions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('deletes an uploaded file', async () => {
    const uploaded = await admin.upload('/admin/uploads', {
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      type: 'image/png',
      name: 'to-delete.png',
    });
    expect(uploaded.status).toBe(201);

    expect((await admin.delete(`/admin/media/${uploaded.body.id}`)).status).toBe(200);
  });

  it('reads the role catalogue the role editor offers', async () => {
    const { status, body } = await admin.get('/admin/roles');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('name');
  });
});

describe('email verification', () => {
  /*
   * The storefront ships a `/verify-email` page that posts here and the route did
   * not exist, so anyone reaching it was told "No such endpoint." — which reads
   * as a broken deployment rather than as a flow this environment does not run.
   * Registration marks accounts verified at creation precisely because no email
   * can be sent, so the honest answer is that there is nothing to confirm.
   */
  it('answers rather than 404ing, and says accounts are already verified', async () => {
    const { status, body } = await harness
      .client()
      .post('/auth/verify-email', { token: 'not-a-real-token' });

    expect(status).toBe(200);
    expect(body.verified).toBe(true);
    expect(body.message).toMatch(/verified/i);
  });

  it('still needs a token, so the page cannot post an empty form', async () => {
    const { status } = await harness.client().post('/auth/verify-email', { token: '' });
    expect(status).toBe(422);
  });

  it('honours a real token when one exists, and clears it', async () => {
    const registered = await harness.client().post('/auth/register', {
      email: 'pending.verify@demo.local',
      password: 'pending-verify-password-9x8y',
      firstName: 'Pending',
      lastName: 'Verify',
      newsletterOptIn: false,
    });
    expect(registered.status).toBe(201);

    /*
     * A token hash as this API would store one: HMAC-SHA-256 of the token, keyed
     * by the session secret. Computed here rather than imported so the test
     * states the format independently of the code under test.
     */
    const token = 'a-verification-token-from-the-other-stack';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('test-session-secret-not-used-anywhere-real'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
    const hash = [...new Uint8Array(signature)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    await harness.database.d1
      .prepare(
        `UPDATE "users"
            SET "isEmailVerified" = 0, "emailVerifiedAt" = NULL,
                "emailVerificationTokenHash" = ?, "emailVerificationExpiresAt" = ?
          WHERE "id" = ?`,
      )
      .bind(hash, new Date(Date.now() + 3_600_000).toISOString(), registered.body.id)
      .run();

    const { status, body } = await harness.client().post('/auth/verify-email', { token });
    expect(status).toBe(200);
    expect(body.verified).toBe(true);

    const row = await columnOf<{ v: number; t: string | null }>(
      `SELECT "isEmailVerified" AS v, "emailVerificationTokenHash" AS t FROM "users" WHERE "id" = ?`,
      registered.body.id,
    );
    expect(row.v).toBe(1);
    // The token is single-use: it is cleared, not left to be replayed.
    expect(row.t).toBeNull();
  });

  it('refuses an expired token', async () => {
    const registered = await harness.client().post('/auth/register', {
      email: 'expired.verify@demo.local',
      password: 'expired-verify-password-4t5r',
      firstName: 'Expired',
      lastName: 'Verify',
      newsletterOptIn: false,
    });

    const token = 'an-expired-verification-token';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('test-session-secret-not-used-anywhere-real'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
    const hash = [...new Uint8Array(signature)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    await harness.database.d1
      .prepare(
        `UPDATE "users"
            SET "emailVerificationTokenHash" = ?, "emailVerificationExpiresAt" = ?
          WHERE "id" = ?`,
      )
      .bind(hash, new Date(Date.now() - 1_000).toISOString(), registered.body.id)
      .run();

    const { status, body } = await harness.client().post('/auth/verify-email', { token });
    expect(status).toBe(400);
    expect(body.message).toMatch(/expired/i);
  });
});
