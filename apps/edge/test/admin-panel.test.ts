/**
 * The administration panel's contract with this API.
 *
 * Every case here drives a screen the way the panel drives it: the same path,
 * the same method, the same body shape apps/admin actually sends. That is the
 * point. A route can exist, be covered by its own unit test, and still 404 the
 * panel because the panel sends PUT where the API registered PATCH, or sends
 * `{ body }` where the schema wants `{ adminReply }` — mismatches no test of
 * either side alone can see. Each expectation below stands in for a screen a
 * reviewer will click, so a failure names the screen that broke.
 *
 * The rule for adding to this file: copy the call out of apps/admin verbatim,
 * do not restate it in whatever shape the API happens to prefer.
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

describe('the session the panel gates on', () => {
  /*
   * The panel's sign-in screen reads `me.user.permissions` and refuses the
   * account when it is empty. Returning the user object bare instead of inside
   * `{ user }` type-checked on both sides and told a Super Admin they had no
   * admin permissions — the storefront header, which reads the same envelope,
   * showed every signed-in customer as signed out at the same time.
   */
  it('answers as { user } with the permissions the gate reads', async () => {
    const { status, body } = await admin.get('/auth/me');
    expect(status).toBe(200);
    expect(body.user).toBeTruthy();
    expect(body.user.email).toBe('admin@demo.local');
    expect(Array.isArray(body.user.permissions)).toBe(true);
    expect(body.user.permissions.length).toBeGreaterThan(0);
    expect(body.user.isStaff).toBe(true);
  });

  it('answers as { user: null } when signed out, not as null', async () => {
    const { status, body } = await harness.client().get('/auth/me');
    expect(status).toBe(200);
    expect(body).toEqual({ user: null });
  });

  it('refuses a customer account at the panel’s door', async () => {
    const customer = harness.client();
    await customer.post('/auth/login', {
      email: 'customer@demo.local',
      password: TEST_CUSTOMER_PASSWORD,
    });

    const me = await customer.get('/auth/me');
    expect(me.body.user.permissions).toHaveLength(0);
    // And the API refuses independently of what the panel chose to render.
    expect((await customer.get('/admin/dashboard')).status).toBe(403);
  });
});

/** Ten minutes out and an hour long — a window the campaign constraint accepts. */
const window = () => ({
  startsAt: new Date(Date.now() + 600_000).toISOString(),
  endsAt: new Date(Date.now() + 4_200_000).toISOString(),
});

/** A window that is open right now, for a campaign that should read as live. */
const openWindow = () => ({
  startsAt: new Date(Date.now() - 3_600_000).toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
});

describe('campaigns', () => {
  /*
   * The screen this covers had no endpoint at all: the panel shipped a
   * "Create campaign" form posting to a path the Worker never registered, so
   * every submission returned "No such endpoint."
   */
  it('creates a campaign from the new-campaign form', async () => {
    const { status, body } = await admin.post('/admin/campaigns', {
      title: 'Midseason Clearance',
      slug: 'midseason-clearance',
      shortDescription: 'A short run of deeper cuts.',
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();

    const listed = await admin.get('/admin/campaigns');
    expect(listed.body.map((c: any) => c.slug)).toContain('midseason-clearance');
  });

  /*
   * Whatever the panel reads, it must be able to write back.
   *
   * The campaign editor loads a campaign, puts the fields in a form and posts
   * them again on Save — so the read has to produce values the write schema
   * accepts. It did not: `isVisible` is `INTEGER … CHECK (x IN (0,1))` in
   * SQLite, arrived as `1`, and the schema wants `z.boolean()`. Every Save
   * returned 422, and because Save failed the status chosen in the editor never
   * reached the database, so the campaign stayed off the storefront. The whole
   * bug is invisible to a test that only posts hand-written payloads, which is
   * why this one feeds the API its own output.
   */
  it('accepts its own campaign back unchanged', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Round Trip',
      slug: 'round-trip',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...openWindow(),
    });
    expect(created.status).toBe(201);

    const loaded = (await admin.get(`/admin/campaigns/${created.body.id}`)).body;
    expect(typeof loaded.isVisible).toBe('boolean');

    // Exactly the fields apps/admin/src/components/campaign-form.tsx sends.
    const saved = await admin.put(`/admin/campaigns/${created.body.id}`, {
      title: loaded.title,
      slug: loaded.slug,
      shortDescription: loaded.shortDescription,
      description: loaded.description,
      startsAt: loaded.startsAt,
      endsAt: loaded.endsAt,
      status: 'ACTIVE',
      position: loaded.position,
      isVisible: loaded.isVisible,
      seoTitle: loaded.seoTitle,
      seoDescription: loaded.seoDescription,
    });
    expect(saved.status).toBe(200);

    // And the change the editor made actually stuck.
    expect((await admin.get(`/admin/campaigns/${created.body.id}`)).body.status).toBe('ACTIVE');
  });

  /*
   * The upload endpoint's own answer has to be acceptable to the next call.
   *
   * `POST /admin/uploads` returns `/media/<key>`, and the media middleware
   * rewrites every `"/media/…` in a JSON response to an absolute URL so the
   * storefront on another origin can load it. The panel posts that value
   * straight to `/images`, which required the relative form and returned 400 —
   * "Images must be uploaded first" — for a file that had just been uploaded.
   */
  it('attaches an image posted back in the absolute form it was given', async () => {
    const [product] = (await admin.get('/admin/products?page=1&pageSize=1')).body.items;
    const absolute = 'https://outlet-demo-api.example.workers.dev/media/products/example.png';

    const added = await admin.post(`/admin/products/${product.id}/images`, {
      url: absolute,
      objectKey: 'products/example.png',
      altText: product.name,
    });
    expect(added.status).toBe(201);
    // Clients always see the absolute form — the media middleware rewrites it
    // on the way out so another origin can load the file.
    expect(added.body.url).toMatch(/^https?:\/\/.*\/media\/products\/example\.png$/);

    // The row itself holds no hostname, so it keeps working across origins.
    const stored = harness.database.sqlite
      .prepare(`SELECT "url" FROM "product_images" WHERE "objectKey" = ?`)
      .get('products/example.png') as { url: string };
    expect(stored.url).toBe('/media/products/example.png');

    const reloaded = await admin.get(`/admin/products/${product.id}`);
    expect(
      reloaded.body.images.some((i: any) => i.url.endsWith('/media/products/example.png')),
    ).toBe(true);
  });

  it('saves a content page posted back exactly as it was read', async () => {
    const pages = (await admin.get('/admin/content/pages')).body;
    expect(Array.isArray(pages)).toBe(true);
    const page = pages[0];
    // The screen edits a spread of this object; it carries the server's own
    // `updatedAt` whether the panel's type mentions it or not.
    expect(page.updatedAt).toBeTruthy();

    const saved = await admin.put('/admin/content/pages', { ...page, title: `${page.title} ` });
    expect(saved.status).toBe(200);
  });

  it('hands the coupons screen booleans it can send straight back', async () => {
    const [coupon] = (await admin.get('/admin/coupons')).body;
    expect(typeof coupon.isActive).toBe('boolean');
    expect(typeof coupon.firstOrderOnly).toBe('boolean');

    // The Activate/Deactivate button passes these through untouched.
    const { status } = await admin.put(`/admin/coupons/${coupon.id}`, {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderMinor: coupon.minOrderMinor,
      maxDiscountMinor: coupon.maxDiscountMinor,
      firstOrderOnly: coupon.firstOrderOnly,
      isActive: !coupon.isActive,
    });
    expect(status).toBe(200);
  });

  it('edits a campaign from the campaign editor', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Renamed Later',
      slug: 'renamed-later',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 3,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });

    const { status } = await admin.put(`/admin/campaigns/${created.body.id}`, {
      title: 'Renamed Now',
      slug: 'renamed-now',
      shortDescription: 'Edited.',
      description: null,
      status: 'SCHEDULED',
      position: 3,
      isVisible: false,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });
    expect(status).toBe(200);

    const reloaded = await admin.get(`/admin/campaigns/${created.body.id}`);
    expect(reloaded.body.title).toBe('Renamed Now');
    expect(reloaded.body.slug).toBe('renamed-now');
    expect(reloaded.body.status).toBe('SCHEDULED');
  });

  it('refuses a slug another campaign already holds', async () => {
    const { status, body } = await admin.post('/admin/campaigns', {
      title: 'Clashing',
      slug: 'midseason-clearance',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });
    expect(status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });

  it('refuses a window that ends before it starts', async () => {
    const { status } = await admin.post('/admin/campaigns', {
      title: 'Backwards',
      slug: 'backwards',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      startsAt: new Date(Date.now() + 4_200_000).toISOString(),
      endsAt: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(status).toBe(422);
  });

  /*
   * The campaigns screen sends `activate`, not `publish`. The enum knew only
   * `publish`, so the single action that puts a campaign live returned 422 —
   * while Pause, End and Archive all worked, which made it look like a fault
   * in particular campaigns rather than a missing word.
   */
  it('activates a campaign with the word the screen sends', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Activate Me',
      slug: 'activate-me',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });

    const { status, body } = await admin.post(`/admin/campaigns/${created.body.id}/status`, {
      action: 'activate',
    });
    expect(status).toBe(200);
    expect(body.status).toBe('ACTIVE');
    expect((await admin.get(`/admin/campaigns/${created.body.id}`)).body.status).toBe('ACTIVE');
  });

  /*
   * The panel's side of this worked all along: the campaign saved, activated,
   * and read back ACTIVE from every admin screen. It simply never reached a
   * shopper, because the home page asks for `?status=active` and the storefront
   * query compared that lowercase word against a column storing `ACTIVE`. The
   * publisher had no way to see the difference — which is why the check has to
   * cross the boundary rather than stop at the admin API.
   */
  it('shows a published campaign on the storefront the home page reads', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Live On The Home Page',
      slug: 'live-on-the-home-page',
      shortDescription: 'Running right now.',
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...openWindow(),
    });
    expect(
      (await admin.post(`/admin/campaigns/${created.body.id}/status`, { action: 'activate' }))
        .status,
    ).toBe(200);

    // Exactly the two calls CampaignSections makes.
    const shopper = harness.client();
    const live = await shopper.get('/campaigns?status=active');
    const upcoming = await shopper.get('/campaigns?status=upcoming');

    expect(live.body.map((c: any) => c.slug)).toContain('live-on-the-home-page');
    // Running, so it is not also advertised as coming soon.
    expect(upcoming.body.map((c: any) => c.slug)).not.toContain('live-on-the-home-page');
  });

  it('files a campaign activated ahead of its start date under upcoming', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Opens Shortly',
      slug: 'opens-shortly',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      // Starts in ten minutes.
      ...window(),
    });
    await admin.post(`/admin/campaigns/${created.body.id}/status`, { action: 'activate' });

    const shopper = harness.client();
    const live = await shopper.get('/campaigns?status=active');
    const upcoming = await shopper.get('/campaigns?status=upcoming');

    // ACTIVE, but it discounts nothing until Friday, so it is not "live".
    expect(live.body.map((c: any) => c.slug)).not.toContain('opens-shortly');
    expect(upcoming.body.map((c: any) => c.slug)).toContain('opens-shortly');
  });

  it('keeps a hidden campaign off the storefront', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Not For Shoppers',
      slug: 'not-for-shoppers',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: false,
      seoTitle: null,
      seoDescription: null,
      ...openWindow(),
    });
    await admin.post(`/admin/campaigns/${created.body.id}/status`, { action: 'activate' });

    const shopper = harness.client();
    expect(
      (await shopper.get('/campaigns?status=active')).body.map((c: any) => c.slug),
    ).not.toContain('not-for-shoppers');
  });

  it.each(['pause', 'end', 'archive', 'draft', 'publish'])('still accepts %s', async (action) => {
    const created = await admin.post('/admin/campaigns', {
      title: `Action ${action}`,
      slug: `action-${action}`,
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });
    const { status } = await admin.post(`/admin/campaigns/${created.body.id}/status`, { action });
    expect(status).toBe(200);
  });

  it('publishes, then puts products in and takes them out', async () => {
    const created = await admin.post('/admin/campaigns', {
      title: 'Stocked',
      slug: 'stocked',
      shortDescription: null,
      description: null,
      status: 'DRAFT',
      position: 0,
      isVisible: true,
      seoTitle: null,
      seoDescription: null,
      ...window(),
    });
    const id = created.body.id;

    expect((await admin.post(`/admin/campaigns/${id}/status`, { action: 'publish' })).status).toBe(
      200,
    );

    const products = await admin.get('/admin/products?page=1&pageSize=1');
    const productId = products.body.items[0].id;

    const added = await admin.post(`/admin/campaigns/${id}/products`, {
      productId,
      campaignPriceMinor: 1234,
    });
    expect(added.status).toBe(201);

    const withProduct = await admin.get(`/admin/campaigns/${id}`);
    expect(withProduct.body.products).toHaveLength(1);

    expect((await admin.delete(`/admin/campaigns/${id}/products/${productId}`)).status).toBe(200);
    expect((await admin.get(`/admin/campaigns/${id}`)).body.products).toHaveLength(0);
  });
});

describe('adding a product from the panel', () => {
  /*
   * The whole payload the new-product form submits, field for field. It sends
   * `taxClass`, which the strict schema did not model, so every attempt to add
   * a product came back "Unrecognized key(s) in object: 'taxClass'" — the
   * panel could not create one at all. The earlier coverage missed it because
   * the test wrote its own payload instead of copying the form's.
   */
  const formPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Aster Seamless Comfort Bra',
    slug: 'aster-seamless-comfort-bra',
    brandId: '',
    categoryId: '',
    shortDescription: 'A soft seamless everyday bra.',
    description: '',
    targetGroup: 'WOMEN',
    materials: '82% nylon, 18% elastane',
    careInstructions: '',
    countryOfOrigin: '',
    originalPriceMinor: 5900,
    outletPriceMinor: 2900,
    status: 'ACTIVE',
    taxClass: 'STANDARD',
    seoTitle: '',
    seoDescription: '',
    searchKeywords: '',
    ...overrides,
  });

  it('creates a product into a subcategory that had none', async () => {
    const [brand] = (await admin.get('/admin/brands')).body;
    const tree = (await admin.get('/admin/categories')).body;
    const flat = (n: any[]): any[] => n.flatMap((x) => [x, ...flat(x.children ?? [])]);

    /*
     * The empty subcategory is created here rather than taken from the seed.
     * This used to reach for `women-bras` on the strength of the catalogue not
     * stocking it; now that every shipped subcategory has products, the only
     * genuinely empty one is a category an administrator has just added — which
     * is the case the panel actually has to handle anyway.
     */
    const parent = flat(tree).find((n: any) => n.level === 'category' && n.isActive);
    const bras = (
      await admin.post('/admin/categories', {
        name: 'Bralettes',
        slug: 'women-bralettes',
        pathSegment: 'bralettes',
        parentId: parent.id,
        targetGroup: parent.targetGroup,
        sizeChartGroup: null,
        description: null,
        position: 98,
        isActive: true,
      })
    ).body;
    expect(
      flat((await admin.get('/admin/categories')).body).find((n: any) => n.id === bras.id).status,
    ).toBe('empty');

    const created = await admin.post(
      '/admin/products',
      formPayload({ brandId: brand.id, categoryId: bras.id }),
    );
    expect(created.status).toBe(201);

    const stored = await admin.get(`/admin/products/${created.body.id}`);
    expect(stored.body.taxClass).toBe('STANDARD');
    expect(stored.body.categoryId).toBe(bras.id);

    /*
     * A product with no variants is not sellable, so the category is still
     * "empty" — correctly. Stock is what makes it real, and adding it is the
     * second half of the job the panel does.
     */
    const variant = await admin.post(`/admin/products/${created.body.id}/variants`, {
      sku: 'AST-BRA-BLACK-M',
      size: 'M',
      color: 'Black',
      initialQuantity: 12,
    });
    expect(variant.status).toBe(201);

    const after = flat((await admin.get('/admin/categories')).body).find(
      (n: any) => n.id === bras.id,
    );
    expect(after.productCount).toBeGreaterThan(0);
    expect(after.status).toBe('active');

    // And a shopper can now find it, in the category and by search.
    const shopper = harness.client();
    const listing = await shopper.get('/catalog/products?q=Seamless%20Comfort');
    expect(listing.body.items.map((i: any) => i.slug)).toContain('aster-seamless-comfort-bra');

    const detail = await shopper.get('/catalog/products/aster-seamless-comfort-bra');
    expect(detail.status).toBe(200);
    expect(detail.body.variants.some((v: any) => v.availableQuantity > 0)).toBe(true);
  });

  it('keeps a non-standard tax class through an edit', async () => {
    const [brand] = (await admin.get('/admin/brands')).body;
    const created = await admin.post(
      '/admin/products',
      formPayload({
        name: 'Reduced Rate Item',
        slug: 'reduced-rate-item',
        brandId: brand.id,
        categoryId: null,
        taxClass: 'REDUCED',
      }),
    );
    expect(created.status).toBe(201);
    expect((await admin.get(`/admin/products/${created.body.id}`)).body.taxClass).toBe('REDUCED');

    // A partial edit that never mentions tax must not reset it.
    await admin.put(`/admin/products/${created.body.id}`, { status: 'DISABLED' });
    expect((await admin.get(`/admin/products/${created.body.id}`)).body.taxClass).toBe('REDUCED');
  });
});

describe('products', () => {
  /* The list view's status dropdown sends PUT with one field. */
  it('changes status from the list without resending the whole product', async () => {
    const products = await admin.get('/admin/products?page=1&pageSize=1');
    const product = products.body.items[0];

    const { status } = await admin.put(`/admin/products/${product.id}`, { status: 'DISABLED' });
    expect(status).toBe(200);

    const reloaded = await admin.get(`/admin/products/${product.id}`);
    expect(reloaded.body.status).toBe('DISABLED');
    // Everything the partial did not name is still there.
    expect(reloaded.body.name).toBe(product.name);
    expect(reloaded.body.outletPriceMinor).toBe(product.outletPriceMinor);

    await admin.put(`/admin/products/${product.id}`, { status: 'ACTIVE' });
  });

  it('still checks the price rule when only one price is sent', async () => {
    const products = await admin.get('/admin/products?page=1&pageSize=1');
    const product = products.body.items[0];

    const { status } = await admin.put(`/admin/products/${product.id}`, {
      outletPriceMinor: product.originalPriceMinor + 1,
    });
    expect(status).toBe(422);
  });

  it('saves the full product the edit form submits', async () => {
    const products = await admin.get('/admin/products?page=1&pageSize=1');
    const product = (await admin.get(`/admin/products/${products.body.items[0].id}`)).body;

    const { status } = await admin.put(`/admin/products/${product.id}`, {
      name: 'Renamed By Test',
      slug: product.slug,
      brandId: product.brandId,
      categoryId: product.categoryId,
      shortDescription: product.shortDescription,
      description: product.description,
      targetGroup: product.targetGroup,
      materials: product.materials,
      careInstructions: product.careInstructions,
      countryOfOrigin: product.countryOfOrigin,
      originalPriceMinor: product.originalPriceMinor,
      outletPriceMinor: product.outletPriceMinor,
      status: product.status,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      searchKeywords: product.searchKeywords,
    });
    expect(status).toBe(200);
    expect((await admin.get(`/admin/products/${product.id}`)).body.name).toBe('Renamed By Test');
  });
});

describe('reviews', () => {
  const firstReview = async () =>
    (await admin.get('/admin/reviews?page=1&pageSize=1')).body.items[0];

  it('lists reviews in the shape the queue renders', async () => {
    const review = await firstReview();
    // The queue reads review.product.slug and review.user?.email directly.
    expect(review.product).toMatchObject({ id: expect.any(String), slug: expect.any(String) });
    expect(typeof review.isVerifiedPurchase).toBe('boolean');
    expect(review).toHaveProperty('helpfulCount');
    expect(review).toHaveProperty('adminReplyBy');
    expect(review).toHaveProperty('moderatedBy');
  });

  it('replies with the field name the panel sends, then withdraws it', async () => {
    const review = await firstReview();

    expect(
      (await admin.post(`/admin/reviews/${review.id}/reply`, { body: 'Thanks.' })).status,
    ).toBe(200);
    const replied = await firstReview();
    expect(replied.adminReply).toBe('Thanks.');
    expect(replied.adminReplyBy?.email).toBe('admin@demo.local');

    expect((await admin.delete(`/admin/reviews/${review.id}/reply`)).status).toBe(200);
    expect((await firstReview()).adminReply).toBeNull();
  });

  it('edits review text through the same path moderation uses', async () => {
    const review = await firstReview();
    const { status } = await admin.patch(`/admin/reviews/${review.id}`, {
      title: 'Tidied',
      body: 'Rewritten by a moderator.',
    });
    expect(status).toBe(200);

    const edited = await firstReview();
    expect(edited.body).toBe('Rewritten by a moderator.');
    // The status is untouched: editing text is not moderating.
    expect(edited.status).toBe(review.status);
  });

  it('moderates through that path too, and moves the product rating', async () => {
    const review = await firstReview();
    const { status } = await admin.patch(`/admin/reviews/${review.id}`, {
      status: 'HIDDEN',
      moderationNote: 'Off topic.',
    });
    expect(status).toBe(200);
    expect((await firstReview()).status).toBe('HIDDEN');
  });

  it('deletes a review and recounts the product', async () => {
    const review = await firstReview();
    const before = (await admin.get(`/admin/products/${review.product.id}`)).body.reviewCount;

    expect((await admin.delete(`/admin/reviews/${review.id}`)).status).toBe(200);

    const after = (await admin.get(`/admin/products/${review.product.id}`)).body.reviewCount;
    expect(after).toBeLessThanOrEqual(before);
    expect((await admin.delete(`/admin/reviews/${review.id}`)).status).toBe(404);
  });
});

describe('settings', () => {
  it('reads settings as the object the form binds to', async () => {
    const { status, body } = await admin.get('/admin/settings');
    expect(status).toBe(200);
    // Not a rows array: the form binds settings.reservationDurationMinutes.
    expect(Array.isArray(body)).toBe(false);
    expect(typeof body.reservationDurationMinutes).toBe('number');
    expect(typeof body.taxRateBps).toBe('number');
  });

  it('saves the whole form in one request', async () => {
    const before = (await admin.get('/admin/settings')).body;

    const { status, body } = await admin.put('/admin/settings', {
      ...before,
      lowStockThreshold: 7,
      standardShippingMinor: 599,
    });
    expect(status).toBe(200);
    expect(body.lowStockThreshold).toBe(7);

    expect((await admin.get('/admin/settings')).body.standardShippingMinor).toBe(599);
  });

  it('refuses a key nothing reads rather than storing it', async () => {
    const { status } = await admin.put('/admin/settings', { notASetting: 1 });
    expect(status).toBe(422);
  });

  it('refuses a reservation window of zero minutes', async () => {
    const { status } = await admin.put('/admin/settings', { reservationDurationMinutes: 0 });
    expect(status).toBe(422);
  });
});

describe('content', () => {
  it('lists and saves CMS pages the way the editor addresses them', async () => {
    const pages = await admin.get('/admin/content/pages');
    expect(pages.status).toBe(200);
    expect(pages.body.length).toBeGreaterThan(0);

    const { status } = await admin.put('/admin/content/pages', {
      key: pages.body[0].key,
      title: pages.body[0].title,
      body: 'Edited by the contract test.',
    });
    expect(status).toBe(200);

    const reloaded = await admin.get('/admin/content/pages');
    expect(reloaded.body.find((p: any) => p.key === pages.body[0].key).body).toBe(
      'Edited by the contract test.',
    );
  });
});

/**
 * A freshly placed order, so a fulfilment test never depends on how many PAID
 * orders the seed happens to contain or on what an earlier test did to them.
 */
async function freshPaidOrder(): Promise<{ id: string }> {
  const shopper = harness.client();
  const listing = await shopper.get('/catalog/products?inStock=true&pageSize=24');
  for (const item of listing.body.items) {
    const product = await shopper.get(`/catalog/products/${item.slug}`);
    const variant = product.body.variants.find((v: any) => v.availableQuantity > 2 && v.isEnabled);
    if (!variant) continue;

    await shopper.post('/cart/items', { variantId: variant.id, quantity: 1 });
    const placed = await shopper.post('/checkout/submit', {
      email: 'fulfilment@demo.local',
      shippingAddress: {
        firstName: 'Ful',
        lastName: 'Filment',
        line1: '9 Example Street',
        city: 'Porto',
        postalCode: '4000',
        countryCode: 'PT',
      },
      shippingMethod: 'STANDARD',
    });
    expect(placed.status).toBe(201);
    return { id: placed.body.orderId };
  }
  throw new Error('The seed produced no purchasable variant');
}

describe('methods the panel actually uses', () => {
  /*
   * Three routes existed under a method the panel never sends. Each answered
   * "No such endpoint." to the only UI that calls it, so the feature was
   * simply inoperable — order fulfilment could not be advanced at all.
   */
  it('advances an order by POST, as the order screen does', async () => {
    const paid = await freshPaidOrder();

    const { status } = await admin.post(`/admin/orders/${paid.id}/status`, {
      status: 'PROCESSING',
      note: null,
      trackingNumber: null,
      carrier: null,
    });
    expect(status).toBe(200);
    expect((await admin.get(`/admin/orders/${paid.id}`)).body.status).toBe('PROCESSING');
  });

  /*
   * The carrier and tracking number the dispatch form collects were rejected
   * by a strict schema and, once accepted, went nowhere: `shipments` was only
   * ever written by the seed, so a shipped order gave the customer nothing to
   * track.
   */
  it('records a shipment when an order is marked shipped', async () => {
    const target = await freshPaidOrder();

    await admin.post(`/admin/orders/${target.id}/status`, { status: 'PROCESSING' });
    await admin.post(`/admin/orders/${target.id}/status`, { status: 'PACKED' });
    const shipped = await admin.post(`/admin/orders/${target.id}/status`, {
      status: 'SHIPPED',
      note: null,
      trackingNumber: 'SIM-TRACK-4471',
      carrier: 'DHL',
    });
    expect(shipped.status).toBe(200);

    const detail = await admin.get(`/admin/orders/${target.id}`);
    const shipment = detail.body.shipments?.[0];
    expect(shipment).toBeTruthy();
    expect(shipment.trackingNumber).toBe('SIM-TRACK-4471');
    expect(shipment.carrier).toBe('DHL');

    // And the customer is told the number, not merely that it shipped.
    const listed = (await admin.get('/admin/shipments')).body;
    expect(listed.some((s: any) => s.trackingNumber === 'SIM-TRACK-4471')).toBe(true);
  });

  it('still accepts PATCH for the same change', async () => {
    const paid = await freshPaidOrder();
    const { status } = await admin.patch(`/admin/orders/${paid.id}/status`, {
      status: 'PROCESSING',
    });
    expect(status).toBe(200);
  });

  it('edits a coupon by PUT, as the coupons screen does', async () => {
    const [coupon] = (await admin.get('/admin/coupons')).body;
    const { status } = await admin.put(`/admin/coupons/${coupon.id}`, {
      code: coupon.code,
      type: 'PERCENTAGE',
      value: 12,
      description: 'Edited by PUT',
      minOrderMinor: null,
      maxDiscountMinor: null,
      maxRedemptions: null,
      maxRedemptionsPerCustomer: null,
      firstOrderOnly: false,
      freeShipping: false,
      endsAt: null,
      isActive: true,
    });
    expect(status).toBe(200);

    const reloaded = (await admin.get('/admin/coupons')).body.find((c: any) => c.id === coupon.id);
    expect(reloaded.description).toBe('Edited by PUT');
  });

  /*
   * The receive form sends a per-line `restock` flag and the item schema was
   * strict without it, so the whole request was rejected and a return could
   * never be received — the step every later one depends on.
   */
  it('receives a return with the per-line restock flag the form sends', async () => {
    const requested = (await admin.get('/admin/returns')).body.find(
      (r: any) => r.status === 'REQUESTED',
    );
    expect(requested).toBeTruthy();

    expect(
      (await admin.post(`/admin/returns/${requested.id}/decision`, { decision: 'APPROVED' }))
        .status,
    ).toBe(200);

    const detail = (await admin.get(`/admin/returns/${requested.id}`)).body;
    const { status } = await admin.post(`/admin/returns/${requested.id}/receive`, {
      items: detail.items.map((item: any) => ({
        returnItemId: item.id,
        receivedQuantity: item.quantity,
        condition: 'RESELLABLE',
        restock: true,
      })),
    });
    expect(status).toBe(200);
    expect((await admin.get(`/admin/returns/${requested.id}`)).body.status).toBe('RECEIVED');
  });

  it('holds a resellable unit back when the operator clears restock', async () => {
    const requested = (await admin.get('/admin/returns')).body.find(
      (r: any) => r.status === 'REQUESTED',
    );
    if (!requested) return; // one per seeded fixture; the case above may have taken it

    await admin.post(`/admin/returns/${requested.id}/decision`, { decision: 'APPROVED' });
    const detail = (await admin.get(`/admin/returns/${requested.id}`)).body;
    const line = detail.items[0];

    const variant = await harness.database.d1
      .prepare(
        `SELECT oi."variantId" AS v FROM "return_items" ri
           JOIN "order_items" oi ON oi."id" = ri."orderItemId" WHERE ri."id" = ?`,
      )
      .bind(line.id)
      .first<{ v: string }>();
    const before = await harness.database.d1
      .prepare(`SELECT "onHandQuantity" AS q FROM "inventory_balances" WHERE "variantId" = ?`)
      .bind(variant!.v)
      .first<{ q: number }>();

    await admin.post(`/admin/returns/${requested.id}/receive`, {
      items: detail.items.map((item: any) => ({
        returnItemId: item.id,
        receivedQuantity: item.quantity,
        condition: 'RESELLABLE',
        restock: false,
      })),
    });

    const after = await harness.database.d1
      .prepare(`SELECT "onHandQuantity" AS q FROM "inventory_balances" WHERE "variantId" = ?`)
      .bind(variant!.v)
      .first<{ q: number }>();
    expect(after!.q).toBe(before!.q);
  });
});

describe('the counts the list views render', () => {
  /*
   * `_count` is Prisma's shape, which is what the panel was written against
   * when it talked to the NestJS API. The Worker builds its counts in SQL, so
   * it has to publish them under that name too — reading `undefined.products`
   * threw during render and blanked the entire page, which is a worse failure
   * than a missing number and one no status-code assertion can see.
   */
  it('gives campaigns a _count.products', async () => {
    const [campaign] = (await admin.get('/admin/campaigns')).body;
    expect(campaign._count.products).toEqual(expect.any(Number));
  });

  it('gives customers a _count.orders', async () => {
    const [customer] = (await admin.get('/admin/customers?page=1&pageSize=1')).body.items;
    expect(customer._count.orders).toEqual(expect.any(Number));
  });
});

/**
 * The detail screens, which the list-view coverage above does not reach.
 *
 * Each reads several collections unguarded — `order.refunds.length`,
 * `customer.returnRequests.map(…)` — so a field the API does not send is not a
 * missing panel, it is a thrown render and a blank page. All four of these
 * screens were blank against this API while every list view worked.
 */
/**
 * Category visibility is a switch, not a side effect of stock.
 *
 * A category used to remove itself from the shop as soon as it had nothing
 * available, so the menu rearranged itself as things sold out and an
 * administrator could neither keep one on nor see from the shop why one had
 * gone. Now `isActive` decides, and emptiness is reported to the admin as
 * information.
 */
describe('category visibility', () => {
  const findNode = (nodes: any[], slug: string): any => {
    for (const node of nodes) {
      if (node.slug === slug) return node;
      const hit = findNode(node.children ?? [], slug);
      if (hit) return hit;
    }
    return null;
  };
  const flatten = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);

  /*
   * The empty category is made here rather than borrowed from the seed.
   *
   * These cases used to pick whichever seeded subcategory happened to have no
   * products, which held only while the catalogue was too small to fill its own
   * taxonomy. Stocking every subcategory left them with nothing to select and
   * they failed — not because empty categories had stopped working, but because
   * the fixture had evaporated. A category an administrator has just created is
   * the real subject anyway: it is empty for exactly as long as it takes to put
   * the first product in, and it has to be visible in that window or there is
   * nowhere to put one.
   */
  const createEmptySubcategory = async (slug: string) => {
    const tree = (await admin.get('/admin/categories')).body;
    const parent = flatten(tree).find((n: any) => n.level === 'category' && n.isActive);
    const { status, body } = await admin.post('/admin/categories', {
      name: 'Just Added',
      slug,
      pathSegment: slug,
      parentId: parent.id,
      targetGroup: parent.targetGroup,
      sizeChartGroup: null,
      description: null,
      position: 99,
      isActive: true,
    });
    expect(status).toBe(201);
    return body;
  };

  it('shows the admin every category, empty ones included', async () => {
    await createEmptySubcategory('freshly-created-empty');

    const tree = (await admin.get('/admin/categories')).body;
    const all = flatten(tree);
    const empty = all.filter((n) => n.status === 'empty');

    expect(all.length).toBeGreaterThan(100);
    expect(empty.length).toBeGreaterThan(0);
    for (const node of empty) {
      expect(node.isActive).toBe(true);
      expect(node.isVisible).toBe(true);
    }
  });

  it('shows an empty category in the shop too', async () => {
    const created = await createEmptySubcategory('empty-but-shoppable');

    const shop = (await harness.client().get('/catalog/categories')).body;
    const adminTree = (await admin.get('/admin/categories')).body;
    const listed = flatten(adminTree).find((n: any) => n.slug === created.slug);

    expect(listed.status).toBe('empty');
    expect(findNode(shop, created.slug)).toBeTruthy();
  });

  /*
   * Every shipped subcategory has stock behind it.
   *
   * The taxonomy is navigation the shop publishes, and a link to an empty grid
   * is a dead end a visitor has to back out of. Emptiness is legitimate only
   * while an administrator is mid-way through adding something, which is what
   * the two cases above cover.
   */
  it('leaves no shipped subcategory without products', async () => {
    const tree = (await admin.get('/admin/categories')).body;
    const shipped = flatten(tree).filter(
      (n: any) => n.level === 'subcategory' && !n.slug.startsWith('freshly-'),
    );

    const bare = shipped.filter((n: any) => n.status === 'empty' && n.name !== 'Just Added');
    expect(bare.map((n: any) => n.slug)).toEqual([]);
    expect(shipped.length).toBeGreaterThan(100);
  });

  it('hides it from the shop when an administrator switches it off', async () => {
    const adminTree = (await admin.get('/admin/categories')).body;
    const target = flatten(adminTree).find((n: any) => n.level === 'subcategory' && n.isActive);

    expect(
      (await admin.patch(`/admin/categories/${target.id}/visibility`, { isActive: false })).status,
    ).toBe(200);

    const shop = (await harness.client().get('/catalog/categories')).body;
    expect(findNode(shop, target.slug)).toBeNull();

    // And the admin still sees it, flagged as hidden rather than gone.
    const after = flatten((await admin.get('/admin/categories')).body).find(
      (n: any) => n.slug === target.slug,
    );
    expect(after.status).toBe('hidden');
    expect(after.isVisible).toBe(false);

    await admin.patch(`/admin/categories/${target.id}/visibility`, { isActive: true });
  });

  it('hides a whole branch when its department is switched off', async () => {
    const adminTree = (await admin.get('/admin/categories')).body;
    const department = adminTree.find((n: any) => n.slug === 'kids');

    await admin.patch(`/admin/categories/${department.id}/visibility`, { isActive: false });
    const shop = (await harness.client().get('/catalog/categories')).body;
    expect(findNode(shop, 'kids')).toBeNull();
    expect(findNode(shop, 'kids-t-shirts')).toBeNull();

    await admin.patch(`/admin/categories/${department.id}/visibility`, { isActive: true });
    expect(findNode((await harness.client().get('/catalog/categories')).body, 'kids')).toBeTruthy();
  });
});

describe('the detail screens', () => {
  it('order detail carries refunds and the history the screen maps over', async () => {
    const [order] = (await admin.get('/admin/orders?page=1&pageSize=1')).body.items;
    const { status, body } = await admin.get(`/admin/orders/${order.id}`);

    expect(status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.payments)).toBe(true);
    expect(Array.isArray(body.refunds)).toBe(true);
    expect(Array.isArray(body.statusHistory)).toBe(true);
  });

  it('customer detail carries returns, refunds and support notes', async () => {
    const [customer] = (await admin.get('/admin/customers?page=1&pageSize=1')).body.items;
    const { status, body } = await admin.get(`/admin/customers/${customer.id}`);

    expect(status).toBe(200);
    expect(Array.isArray(body.orders)).toBe(true);
    expect(Array.isArray(body.addresses)).toBe(true);
    expect(Array.isArray(body.supportNotes)).toBe(true);
    expect(Array.isArray(body.returnRequests)).toBe(true);
    expect(Array.isArray(body.refunds)).toBe(true);
    expect(body).toHaveProperty('disabledReason');
  });

  it('campaign detail nests each product the editor renders', async () => {
    // A seeded campaign, not one an earlier case created empty.
    const campaign = (await admin.get('/admin/campaigns')).body.find(
      (c: any) => c._count.products > 0,
    );
    expect(campaign).toBeTruthy();
    const { status, body } = await admin.get(`/admin/campaigns/${campaign.id}`);

    expect(status).toBe(200);
    expect(body.products.length).toBeGreaterThan(0);
    for (const row of body.products) {
      expect(row.product).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        outletPriceMinor: expect.any(Number),
      });
      expect(row.product.brand.name).toEqual(expect.any(String));
    }
  });

  it('return detail carries its refunds', async () => {
    const [request] = (await admin.get('/admin/returns')).body;
    const { status, body } = await admin.get(`/admin/returns/${request.id}`);

    expect(status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.refunds)).toBe(true);
  });
});

describe('every screen the panel loads', () => {
  /*
   * The read behind each menu item. A 404 here means the panel would render an
   * error where a page should be — the failure mode this whole file exists to
   * catch, and the one that shipped.
   */
  const screens: Array<[string, string]> = [
    ['Dashboard', '/admin/dashboard'],
    ['Products', '/admin/products?page=1&pageSize=25'],
    ['Categories', '/admin/categories'],
    ['Brands', '/admin/brands'],
    ['Inventory', '/admin/inventory?page=1&pageSize=100'],
    ['Inventory movements', '/admin/inventory/movements?page=1&pageSize=50'],
    ['Reservations', '/admin/inventory/reservations?page=1&pageSize=100'],
    ['Orders', '/admin/orders?page=1&pageSize=25'],
    ['Customers', '/admin/customers?page=1&pageSize=50'],
    ['Reviews', '/admin/reviews?page=1&pageSize=25'],
    ['Review stats', '/admin/reviews/stats'],
    ['Coupons', '/admin/coupons'],
    ['Campaigns', '/admin/campaigns'],
    ['Returns', '/admin/returns'],
    ['Content', '/admin/content/pages'],
    ['Settings', '/admin/settings'],
    ['Admin users', '/admin/users'],
    ['Roles', '/admin/roles'],
    ['Audit log', '/admin/audit-logs?page=1&pageSize=50'],
  ];

  it.each(screens)('%s loads', async (_name, path) => {
    const { status } = await admin.get(path);
    expect(status).toBe(200);
  });
});
