/**
 * Every endpoint the admin panel can reach is served by this API.
 *
 * One case, for the failure that produced four separate defects in one sweep: a
 * button in the panel whose endpoint was never registered on the Worker. Two CSV
 * exports, an invoice and a packing slip — all four plain `<a href>` links
 * rather than fetch calls, which is exactly why they were the ones missing. An
 * audit of `api.get(...)` call sites cannot see an anchor, so nothing noticed
 * that clicking them navigated the operator's tab to
 * `{"code":"NOT_FOUND","message":"No such endpoint."}`.
 *
 * What this file asserts is narrow on purpose: that each path reaches a handler.
 * What each one *does* belongs to `admin-panel.test.ts` and
 * `admin-writes.test.ts`. So a validation error is a pass here — the point is
 * that the route exists at all. Anything else would duplicate those files and
 * rot.
 *
 * **Adding a call to the panel means adding its path here.** The list is
 * deliberately literal rather than scraped from apps/admin at runtime: a scraper
 * would have to parse template strings and JSX to find the anchors, and would
 * fail open — quietly covering nothing — on the exact call shapes that have
 * broken before.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type TestClient, type TestHarness } from './helpers/app';
import { TEST_ADMIN_PASSWORD } from './helpers/d1';

let harness: TestHarness;
let admin: TestClient;

/** Real ids, so a 404 can only mean the route is missing, never that the row is. */
let ids: Record<string, string>;

beforeAll(async () => {
  harness = await createHarness();
  admin = harness.client();
  expect(
    (await admin.post('/auth/login', { email: 'admin@demo.local', password: TEST_ADMIN_PASSWORD }))
      .status,
  ).toBe(200);

  const product = (await admin.get('/admin/products?page=1&pageSize=1')).body.items[0];
  const detail = (await admin.get(`/admin/products/${product.id}`)).body;
  const order = (await admin.get('/admin/orders?page=1&pageSize=1')).body.items[0];
  const customer = (await admin.get('/admin/customers?page=1&pageSize=1')).body.items[0];
  const review = (await admin.get('/admin/reviews?page=1&pageSize=1')).body.items[0];
  const campaign = (await admin.get('/admin/campaigns')).body[0];
  const coupon = (await admin.get('/admin/coupons')).body[0];
  const category = (await admin.get('/admin/categories')).body[0];
  const reservation = (await admin.get('/admin/inventory/reservations?page=1&pageSize=1')).body
    .items[0];
  const returnRequest = (await admin.get('/admin/returns')).body[0];
  const audit = (await admin.get('/admin/audit-logs?page=1&pageSize=1')).body.items[0];
  const user = (await admin.get('/admin/users')).body[0];
  const upload = await admin.upload('/admin/uploads', {
    bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    type: 'image/png',
    name: 'routability.png',
  });

  ids = {
    product: product.id,
    variant: detail.variants[0].id,
    image: detail.images[0]?.id ?? 'img_none',
    order: order.id,
    customer: customer.id,
    review: review.id,
    campaign: campaign.id,
    coupon: coupon.id,
    category: category.id,
    reservation: reservation?.id ?? 'res_none',
    returnRequest: returnRequest?.id ?? 'ret_none',
    audit: audit.id,
    user: user.id,
    upload: upload.body.id,
  };
});
afterAll(() => harness.close());

/**
 * The only failure this file recognises.
 *
 * `notFound` in http/app.ts answers an unregistered path with this exact body,
 * while a handler that ran and could not find the row answers with its own
 * message. Distinguishing them is what lets the assertion be about routing
 * rather than about fixtures.
 */
const isUnrouted = (status: number, body: any): boolean =>
  status === 404 && body?.code === 'NOT_FOUND' && body?.message === 'No such endpoint.';

async function findUnrouted(calls: Array<[string, string]>): Promise<string[]> {
  const missing: string[] = [];
  for (const [method, path] of calls) {
    const { status, body } = await admin.request(method, path, method === 'GET' ? undefined : {});
    if (isUnrouted(status, body)) missing.push(`${method} ${path}`);
  }
  return missing;
}

describe('every endpoint the admin panel can reach', () => {
  it('serves every path the panel reads', async () => {
    expect(
      await findUnrouted([
        ['GET', '/auth/me'],
        ['GET', '/admin/dashboard'],

        // Products, including the export the toolbar links to.
        ['GET', '/admin/products?page=1&pageSize=25'],
        ['GET', '/admin/products?page=1&pageSize=100'],
        ['GET', `/admin/products/${ids.product}`],
        ['GET', '/admin/products/export/csv'],
        ['GET', '/admin/brands'],

        // Catalogue tree and stock.
        ['GET', '/admin/categories'],
        ['GET', '/admin/inventory?page=1&pageSize=100'],
        ['GET', '/admin/inventory/movements?page=1&pageSize=50'],
        ['GET', '/admin/inventory/export/csv'],
        ['GET', '/admin/inventory/reservations?page=1&pageSize=100&status=ACTIVE'],

        // Orders, including both printable documents.
        ['GET', '/admin/orders?page=1&pageSize=25'],
        ['GET', `/admin/orders/${ids.order}`],
        ['GET', `/admin/orders/${ids.order}/invoice`],
        ['GET', `/admin/orders/${ids.order}/packing-slip`],

        ['GET', '/admin/customers?page=1&pageSize=50'],
        ['GET', `/admin/customers/${ids.customer}`],

        ['GET', '/admin/coupons'],
        ['GET', '/admin/campaigns'],
        ['GET', `/admin/campaigns/${ids.campaign}`],
        ['GET', '/admin/promotions'],

        ['GET', '/admin/returns'],
        ['GET', '/admin/returns?status=REQUESTED'],
        ['GET', `/admin/returns/${ids.returnRequest}`],

        ['GET', '/admin/reviews?page=1&pageSize=25'],
        ['GET', '/admin/reviews/stats?page=1&pageSize=25'],

        ['GET', '/admin/content/pages'],
        ['GET', '/admin/settings'],
        ['GET', '/admin/users'],
        ['GET', '/admin/roles'],
        ['GET', '/admin/audit-logs?page=1&pageSize=50'],
        ['GET', `/admin/audit-logs/${ids.audit}`],
      ]),
    ).toEqual([]);
  });

  it('serves every path the panel writes to, under the method it uses', async () => {
    /*
     * The method matters as much as the path. Three routes once existed only
     * under a method the panel never sends, and each answered "No such
     * endpoint." to the screen that depended on it.
     */
    expect(
      await findUnrouted([
        ['POST', '/admin/products'],
        ['PUT', `/admin/products/${ids.product}`],
        ['POST', `/admin/products/${ids.product}/archive`],
        ['POST', `/admin/products/${ids.product}/duplicate`],
        ['POST', `/admin/products/${ids.product}/variants`],
        ['POST', `/admin/products/${ids.product}/images`],
        ['DELETE', `/admin/products/${ids.product}/images/${ids.image}`],
        ['POST', '/admin/products/import/csv'],
        ['PATCH', `/admin/variants/${ids.variant}/enabled`],
        ['POST', '/admin/uploads'],

        ['POST', '/admin/categories'],
        ['PUT', `/admin/categories/${ids.category}`],
        // A collection operation sharing its shape with `/categories/:id`, so it
        // only works while it is dispatched from inside that handler.
        ['PUT', '/admin/categories/reorder'],
        ['PATCH', `/admin/categories/${ids.category}/visibility`],
        ['POST', `/admin/categories/${ids.category}/delete`],

        ['POST', '/admin/inventory/adjust'],
        ['POST', `/admin/inventory/reservations/${ids.reservation}/cancel`],

        ['POST', `/admin/orders/${ids.order}/status`],
        ['POST', `/admin/orders/${ids.order}/notes`],
        ['POST', `/admin/orders/${ids.order}/resend-confirmation`],
        ['POST', '/admin/orders/refunds'],

        ['POST', `/admin/customers/${ids.customer}/disable`],
        ['POST', `/admin/customers/${ids.customer}/enable`],
        ['POST', `/admin/customers/${ids.customer}/notes`],

        ['POST', '/admin/coupons'],
        ['PUT', `/admin/coupons/${ids.coupon}`],

        ['POST', '/admin/campaigns'],
        ['PUT', `/admin/campaigns/${ids.campaign}`],
        ['POST', `/admin/campaigns/${ids.campaign}/status`],
        ['POST', `/admin/campaigns/${ids.campaign}/products`],
        ['DELETE', `/admin/campaigns/${ids.campaign}/products/${ids.product}`],

        ['POST', `/admin/returns/${ids.returnRequest}/decision`],
        ['POST', `/admin/returns/${ids.returnRequest}/receive`],
        ['POST', `/admin/returns/${ids.returnRequest}/complete`],

        ['POST', `/admin/reviews/${ids.review}/status`],
        ['POST', '/admin/reviews/bulk'],
        ['PATCH', `/admin/reviews/${ids.review}`],
        ['POST', `/admin/reviews/${ids.review}/reply`],
        ['DELETE', `/admin/reviews/${ids.review}/reply`],

        ['PUT', '/admin/content/pages'],
        ['PUT', '/admin/settings'],
        ['PUT', '/admin/settings/lowStockThreshold'],
        ['POST', `/admin/users/${ids.user}/roles`],
        ['DELETE', `/admin/media/${ids.upload}`],
      ]),
    ).toEqual([]);
  });

  it('serves every path the storefront’s auth pages post', async () => {
    // `/auth/verify-email` is here because it was missing: the storefront ships
    // the page, the NestJS stack has the endpoint, this one did not.
    expect(
      await findUnrouted([
        ['POST', '/auth/login'],
        ['POST', '/auth/register'],
        ['POST', '/auth/logout'],
        ['POST', '/auth/change-password'],
        ['POST', '/auth/forgot-password'],
        ['POST', '/auth/reset-password'],
        ['POST', '/auth/verify-email'],
        ['GET', '/auth/sessions'],
        ['POST', '/auth/sessions/revoke-others'],
      ]),
    ).toEqual([]);
  });

  /*
   * The other half of the guarantee: this file's own test must be able to fail.
   * If `isUnrouted` ever stopped recognising the notFound body — a reworded
   * message, a changed code — every list above would pass vacuously and the one
   * failure this file exists to catch would become invisible.
   */
  it('recognises an unrouted path when it sees one', async () => {
    expect(await findUnrouted([['GET', '/admin/definitely-not-a-route']])).toEqual([
      'GET /admin/definitely-not-a-route',
    ]);
    expect(await findUnrouted([['POST', '/admin/products/not-a-real-action']])).toHaveLength(1);
  });
});
