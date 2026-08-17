/**
 * The customer-facing API.
 *
 * Paths match the ones the storefront already calls, so pointing the Next.js
 * apps at this Worker is a base-URL change rather than a rewrite.
 *
 * Reads are public. Anything that writes goes through the CSRF origin check in
 * http/security.ts before it gets here, and anything personal resolves the
 * caller's own id from the session cookie rather than from the URL.
 */

import { Hono, type Context } from 'hono';
import type { PaymentSessionDto } from '@outlet/types';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';
import { ApiError, notFound } from '../lib/errors';
import { enforceRateLimit } from '../http/rate-limit';
import { Db, fromBool, nowIso } from '../lib/sql';
import { newId, nextRmaNumber } from '../lib/ids';
import {
  getProductBySlug,
  listProducts,
  relatedProducts,
  searchSuggestions,
  type ListProductsParams,
} from '../services/catalog';
import {
  getCampaign,
  getContentPage,
  getProductReviews,
  listBrands,
  listCampaigns,
  listCategories,
  resolveCategoryPath,
} from '../services/navigation';
import { readSettings } from '../services/settings';
import { notify } from '../services/inbox';
import * as cartService from '../services/cart';
import { findOrderByIdempotencyKey, placeDemoOrder } from '../services/checkout';
import {
  listOrdersForCustomer,
  loadOrder,
  orderTimeline,
  paymentsForOrder,
  shipmentsForOrder,
} from '../services/orders';
import * as authRoutes from './auth';
import {
  addToCartSchema,
  couponSchema,
  newsletterSchema,
  parse,
  pathId,
  pathSlug,
  notificationPreferencesSchema,
  profileSchema,
  readJson,
  returnRequestSchema,
  reviewSchema,
  addressSchema,
  checkoutSchema,
  updateQuantitySchema,
  wishlistAddSchema,
} from '../lib/validate';
import { cartCookie } from '../auth/session';
import { requireSession, writeAudit } from '../auth/rbac';

export const storefront = new Hono<AppEnv>();

/** Query string as a plain object, for the listing filters. */
const queryOf = (c: Context<AppEnv>): ListProductsParams => c.req.query() as ListProductsParams;

// --- Catalogue ---------------------------------------------------------------

storefront.get('/catalog/products', async (c) => {
  const { db, env, ip } = ctxOf(c);
  const params = queryOf(c);
  if (params.q) await enforceRateLimit(env.RATE_LIMIT, 'search', ip);
  return c.json(await listProducts(db, params));
});

storefront.get('/catalog/products/:slug', async (c) => {
  const { db } = ctxOf(c);
  const product = await getProductBySlug(db, pathSlug(c.req.param('slug')));
  if (!product) throw notFound('Product not found.');
  return c.json(product);
});

storefront.get('/catalog/products/:slug/reviews', async (c) => {
  const { db } = ctxOf(c);
  const reviews = await getProductReviews(db, pathSlug(c.req.param('slug')), c.req.query());
  if (!reviews) throw notFound('Product not found.');
  return c.json(reviews);
});

storefront.get('/catalog/products/:slug/related', async (c) => {
  const { db } = ctxOf(c);
  const limit = Number(c.req.query('limit')) || 4;
  return c.json(await relatedProducts(db, pathSlug(c.req.param('slug')), limit));
});

storefront.get('/catalog/brands', async (c) => c.json(await listBrands(ctxOf(c).db)));

storefront.get('/catalog/categories', async (c) => c.json(await listCategories(ctxOf(c).db)));

storefront.get('/catalog/categories/path', async (c) => {
  const segments = (c.req.query('path') ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 3);
  const trail = await resolveCategoryPath(ctxOf(c).db, segments);
  if (!trail) throw notFound('Category not found.');
  return c.json(trail);
});

storefront.get('/catalog/suggest', async (c) => {
  const { db, env, ip } = ctxOf(c);
  await enforceRateLimit(env.RATE_LIMIT, 'search', ip);
  return c.json(await searchSuggestions(db, c.req.query('q') ?? ''));
});

/**
 * Recommendations.
 *
 * Derived from what the shopper has just been looking at rather than from a
 * model: the products they recently viewed, wishlisted or carted point at a
 * category and an audience, and the rail is the best-discounted in-stock
 * products from there. Honest about what it is, and it needs no tracking.
 */
storefront.get('/catalog/recommended', async (c) => {
  const { db } = ctxOf(c);
  const slugs = (c.req.query('recent') ?? '').split(',').filter(Boolean).slice(0, 20);
  const audience = c.req.query('audience') ?? undefined;
  const limit = Math.min(12, Number(c.req.query('limit')) || 4);

  if (slugs.length > 0) {
    const related = await relatedProducts(db, slugs[0], limit);
    if (related.length > 0) return c.json(related);
  }
  const page = await listProducts(db, {
    targetGroup: audience,
    inStock: 'true',
    sort: 'discount',
    pageSize: String(limit),
  });
  return c.json(page.items);
});

// --- Campaigns and content ---------------------------------------------------

storefront.get('/campaigns', async (c) =>
  c.json(await listCampaigns(ctxOf(c).db, c.req.query('status'))),
);

/**
 * A campaign page, with the products in it.
 *
 * `products` is not optional: the page's own type is `CampaignDto & { products:
 * ProductListItemDto[] }`, and `CampaignDetail` reads `campaign.products.length`
 * for its heading before passing the array to the grid. Returning the campaign
 * row alone threw on `undefined.length` during render, so every campaign page on
 * the deployed site was a blank screen — reachable from the home page, the
 * campaigns list, and any promotion just published from the admin panel.
 *
 * Built through `listProducts` with the campaign filter rather than a query of
 * its own, so a product in a campaign is described exactly as the same product
 * is described everywhere else: same price maths, same availability, same
 * discount, same shape the grid already renders.
 */
storefront.get('/campaigns/:slug', async (c) => {
  const { db } = ctxOf(c);
  const campaign = await getCampaign(db, pathSlug(c.req.param('slug')));
  if (!campaign) throw notFound('Campaign not found.');

  const products = await listProducts(db, {
    campaign: campaign.slug,
    // A campaign is a short run of a bounded set; 96 is the ceiling the
    // listing enforces anyway, and paginating a campaign page is not something
    // the front end offers.
    pageSize: '96',
    sort: 'recommended',
  });

  return c.json({ ...campaign, products: products.items });
});

storefront.get('/content/pages/:key', async (c) => {
  const page = await getContentPage(ctxOf(c).db, pathSlug(c.req.param('key'), 'page key'));
  if (!page) throw notFound('Page not found.');
  return c.json(page);
});

/** Public store settings — shipping prices, thresholds, hero copy. */
storefront.get('/settings', async (c) => {
  const settings = await readSettings(ctxOf(c).db);
  return c.json(settings);
});

// --- Auth --------------------------------------------------------------------

storefront.route('/auth', authRoutes.auth);

// --- Cart --------------------------------------------------------------------

/**
 * Resolves the caller's cart and, when it had to create one, arranges for the
 * anonymous cart cookie to be sent back with the response.
 */
async function cartFor(c: Context<AppEnv>, create: boolean) {
  const ctx = ctxOf(c);
  const owner: cartService.CartOwner = {
    userId: ctx.session?.user.id ?? null,
    anonymousToken: ctx.cartToken,
  };
  const cart = await cartService.resolveCart(ctx.db, owner, { create });
  if (cart?.issuedToken) {
    ctx.setCookies.push(cartCookie(ctx.config, cart.issuedToken));
    owner.anonymousToken = cart.issuedToken;
  }
  return { ctx, owner, cart };
}

/** An empty cart, for a caller who has never added anything. */
const emptyCart = (currencyCode: string) => ({
  id: '',
  items: [],
  savedForLater: [],
  currencyCode,
  subtotalMinor: 0,
  discountMinor: 0,
  shippingMinor: 0,
  taxMinor: 0,
  totalMinor: 0,
  couponCode: null,
  couponDiscountMinor: 0,
  itemCount: 0,
  freeShipping: { thresholdMinor: 0, remainingMinor: 0, qualified: false },
  deliveryEstimate: null,
  messages: [],
});

async function respondWithCart(c: Context<AppEnv>, cart: cartService.ResolvedCart) {
  const ctx = ctxOf(c);
  const fresh = await cartService.resolveCart(
    ctx.db,
    { userId: ctx.session?.user.id ?? null, anonymousToken: ctx.cartToken },
    { create: false },
  );
  const view = await cartService.readCart(ctx.db, cart.id, fresh?.couponId ?? cart.couponId, {
    userId: ctx.session?.user.id ?? null,
  });
  return c.json(view);
}

storefront.get('/cart', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) {
    const settings = await readSettings(ctx.db);
    return c.json(emptyCart(settings.currencyCode));
  }
  return respondWithCart(c, cart);
});

storefront.post('/cart/items', async (c) => {
  const body = parse(addToCartSchema, await readJson(c.req.raw));
  const { ctx, owner, cart } = await cartFor(c, true);
  await cartService.addItem(ctx.db, cart!, owner, body);
  return respondWithCart(c, cart!);
});

storefront.patch('/cart/items/:id', async (c) => {
  const body = parse(updateQuantitySchema, await readJson(c.req.raw));
  const { ctx, owner, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.updateQuantity(ctx.db, cart, owner, pathId(c.req.param('id')), body.quantity);
  return respondWithCart(c, cart);
});

storefront.put('/cart/items/:id', async (c) => {
  const body = parse(updateQuantitySchema, await readJson(c.req.raw));
  const { ctx, owner, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.updateQuantity(ctx.db, cart, owner, pathId(c.req.param('id')), body.quantity);
  return respondWithCart(c, cart);
});

storefront.delete('/cart/items/:id', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.removeItem(ctx.db, cart, pathId(c.req.param('id')));
  return respondWithCart(c, cart);
});

storefront.post('/cart/items/:id/save', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.saveForLater(ctx.db, cart, pathId(c.req.param('id')));
  return respondWithCart(c, cart);
});

storefront.post('/cart/saved/:id/restore', async (c) => {
  const { ctx, owner, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.restoreSaved(ctx.db, cart, owner, pathId(c.req.param('id')));
  return respondWithCart(c, cart);
});

storefront.delete('/cart/saved/:id', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.removeItem(ctx.db, cart, pathId(c.req.param('id')));
  return respondWithCart(c, cart);
});

storefront.delete('/cart', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) {
    const settings = await readSettings(ctx.db);
    return c.json(emptyCart(settings.currencyCode));
  }
  await cartService.clearCart(ctx.db, cart);
  return respondWithCart(c, cart);
});

storefront.post('/cart/coupon', async (c) => {
  const body = parse(couponSchema, await readJson(c.req.raw));
  const { ctx, cart } = await cartFor(c, true);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'coupon', ctx.ip);
  await cartService.applyCoupon(ctx.db, cart!, body.code);
  return respondWithCart(c, cart!);
});

storefront.delete('/cart/coupon', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) throw notFound('Your cart is empty.');
  await cartService.applyCoupon(ctx.db, cart, null);
  return respondWithCart(c, cart);
});

// --- Checkout ----------------------------------------------------------------

storefront.post('/checkout/start', async (c) => {
  const { ctx, cart } = await cartFor(c, false);
  if (!cart) throw new ApiError('CART_EMPTY', 'Your cart is empty.');

  const settings = await readSettings(ctx.db);
  const view = await cartService.readCart(
    ctx.db,
    cart.id,
    cart.couponId,
    { userId: ctx.session?.user.id ?? null },
    settings,
  );
  if (view.itemCount === 0) throw new ApiError('CART_EMPTY', 'Your cart is empty.');

  const deadline = await ctx.db.first<{ expiresAt: string }>(
    `SELECT MIN("expiresAt") AS "expiresAt" FROM "inventory_reservations"
      WHERE "cartId" = ? AND "status" IN ('ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING')`,
    cart.id,
  );

  return c.json({
    cart: view,
    shippingMethods: [
      {
        id: 'STANDARD',
        label: 'Standard delivery',
        priceMinor: settings.standardShippingMinor,
        estimatedDays: '3–5 working days',
      },
      {
        id: 'EXPRESS',
        label: 'Express delivery',
        priceMinor: settings.expressShippingMinor,
        estimatedDays: '1–2 working days',
      },
    ],
    reservationDeadline: deadline?.expiresAt ?? null,
  });
});

/**
 * Places the demo order.
 *
 * The body carries an address, an email and a shipping method. It does not
 * carry prices, and if it did they would not be read: every figure on the
 * order is computed from the database inside `placeDemoOrder`.
 */
storefront.post('/checkout/submit', async (c) => {
  const body = parse(checkoutSchema, await readJson(c.req.raw));
  const ctx = ctxOf(c);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'checkout', ctx.ip);

  // Placing the order converts the cart, so a double-clicked second request
  // arrives with nothing left to check out. The replay is answered before the
  // cart is looked at, rather than after.
  const replay = await findOrderByIdempotencyKey(ctx.db, body.idempotencyKey);
  const result =
    replay ??
    (await (async () => {
      const { cart } = await cartFor(c, false);
      if (!cart) throw new ApiError('CART_EMPTY', 'Your cart is empty.');
      return placeDemoOrder(
        ctx.db,
        { cartId: cart.id, couponId: cart.couponId, userId: ctx.session?.user.id ?? null },
        body,
      );
    })());

  const session: PaymentSessionDto = {
    paymentId: result.paymentId,
    orderId: result.orderId,
    provider: 'demo',
    /*
     * The order is already placed and marked paid, so the browser goes
     * straight to confirmation. There is no payment page to visit because
     * there is no payment to make.
     *
     * `orderId` first, and spelled that way: the confirmation page polls
     * `/account/orders/:orderId` and gives up with "Missing order reference"
     * without it. Both other backends emit the same parameter — this one used
     * to send `order=<number>`, so a completed purchase ended on an error
     * screen even though the order was placed correctly. `paymentId` rides
     * along for the guest path, which polls the payment instead.
     */
    redirectUrl: `/checkout/result?orderId=${encodeURIComponent(result.orderId)}&paymentId=${encodeURIComponent(result.paymentId)}`,
    amountMinor: result.totalMinor,
    currencyCode: result.currencyCode,
  };

  // Only the first submission is an event; a double-clicked replay returns the
  // same order and is not a second purchase.
  if (!result.alreadyPlaced) {
    await writeAudit(ctx.db, ctx.session, ctx.ip, {
      action: 'order.placed',
      entityType: 'Order',
      entityId: result.orderId,
      after: {
        orderNumber: result.orderNumber,
        totalMinor: result.totalMinor,
        currencyCode: result.currencyCode,
        email: body.email ?? ctx.session?.user.email ?? null,
      },
    });
  }

  return c.json(session, result.alreadyPlaced ? 200 : 201);
});

/** Payment status, for the confirmation screen. Always a demo payment. */
storefront.get('/payments/:id/status', async (c) => {
  const { db, session } = ctxOf(c);
  const payment = await db.first<{
    id: string;
    orderId: string;
    status: string;
    amountMinor: number;
    currencyCode: string;
    orderNumber: string;
    userId: string | null;
  }>(
    `SELECT p."id", p."orderId", p."status", p."amountMinor", p."currencyCode",
            o."orderNumber", o."userId"
       FROM "payments" p JOIN "orders" o ON o."id" = p."orderId"
      WHERE p."id" = ?`,
    pathId(c.req.param('id'), 'payment id'),
  );
  if (!payment) throw notFound('Payment not found.');
  // A guest checkout has no session, so an anonymous order's confirmation has
  // to stay reachable; an order that belongs to *someone* is only shown to
  // them. The id is unguessable, which is what makes the guest case safe.
  if (payment.userId && payment.userId !== session?.user.id) throw notFound('Payment not found.');

  return c.json({
    paymentId: payment.id,
    orderId: payment.orderId,
    orderNumber: payment.orderNumber,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currencyCode: payment.currencyCode,
    provider: 'demo',
    demo: true,
  });
});

// --- Account -----------------------------------------------------------------

/**
 * The account profile, carrying the notification preferences with it.
 *
 * The preferences screen binds `profile.notificationPreferences.orderUpdates`
 * and has no second request to fall back on, so the session user alone left it
 * reading a property of undefined and blanked the page. The three flags are
 * stored as separate columns and grouped here under the names the form uses.
 */
storefront.get('/account/profile', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const prefs = await ctx.db.first<{
    notifyOrderUpdates: number;
    notifyCampaigns: number;
    newsletterOptIn: number;
  }>(
    `SELECT "notifyOrderUpdates", "notifyCampaigns", "newsletterOptIn"
       FROM "users" WHERE "id" = ?`,
    session.user.id,
  );

  return c.json({
    ...session.user,
    notificationPreferences: {
      orderUpdates: fromBool(prefs?.notifyOrderUpdates ?? 1),
      campaignAnnouncements: fromBool(prefs?.notifyCampaigns ?? 1),
      newsletter: fromBool(prefs?.newsletterOptIn ?? 0),
    },
  });
});

storefront.patch('/account/profile', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(profileSchema, await readJson(c.req.raw));

  const fields: string[] = [];
  const bindings: Array<string | number> = [];
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    fields.push(`"${key}" = ?`);
    bindings.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  if (fields.length > 0) {
    await ctx.db.run(
      `UPDATE "users" SET ${fields.join(', ')}, "updatedAt" = ? WHERE "id" = ?`,
      ...bindings,
      nowIso(),
      session.user.id,
    );
  }
  return c.json({ ...session.user, ...body });
});

storefront.patch('/account/notification-preferences', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(notificationPreferencesSchema, await readJson(c.req.raw));

  // The form posts the preference object it was given back, under the names
  // GET /account/profile publishes; the column names are this API's own.
  const orderUpdates = body.orderUpdates ?? body.notifyOrderUpdates;
  const campaigns = body.campaignAnnouncements ?? body.notifyCampaigns;
  const newsletter = body.newsletter ?? body.newsletterOptIn;
  const flag = (value: boolean | undefined) => (value === undefined ? null : value ? 1 : 0);

  await ctx.db.run(
    `UPDATE "users" SET "notifyOrderUpdates" = COALESCE(?, "notifyOrderUpdates"),
                        "notifyCampaigns" = COALESCE(?, "notifyCampaigns"),
                        "newsletterOptIn" = COALESCE(?, "newsletterOptIn"),
                        "updatedAt" = ?
      WHERE "id" = ?`,
    flag(orderUpdates),
    flag(campaigns),
    flag(newsletter),
    nowIso(),
    session.user.id,
  );
  return c.json({
    ok: true,
    notificationPreferences: {
      orderUpdates: orderUpdates ?? true,
      campaignAnnouncements: campaigns ?? true,
      newsletter: newsletter ?? false,
    },
  });
});

storefront.get('/account/addresses', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  return c.json(
    await ctx.db.all(
      `SELECT "id", "firstName", "lastName", "line1", "line2", "city", "region", "postalCode",
              "countryCode", "phone", "isDefaultShipping", "isDefaultBilling"
         FROM "addresses" WHERE "userId" = ? ORDER BY "isDefaultShipping" DESC, "createdAt"`,
      session.user.id,
    ),
  );
});

storefront.post('/account/addresses', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(addressSchema, await readJson(c.req.raw));
  const id = newId();
  await ctx.db.run(
    `INSERT INTO "addresses" ("id", "userId", "firstName", "lastName", "line1", "line2", "city",
                              "region", "postalCode", "countryCode", "phone")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    session.user.id,
    body.firstName,
    body.lastName,
    body.line1,
    body.line2 ?? null,
    body.city,
    body.region ?? null,
    body.postalCode,
    body.countryCode,
    body.phone ?? null,
  );
  return c.json({ id, ...body }, 201);
});

storefront.delete('/account/addresses/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  // The userId in the WHERE clause is what stops this deleting someone else's
  // address by id.
  const result = await ctx.db.run(
    `DELETE FROM "addresses" WHERE "id" = ? AND "userId" = ?`,
    pathId(c.req.param('id')),
    session.user.id,
  );
  if (Db.changes(result) === 0) throw notFound('Address not found.');
  return c.json({ ok: true });
});

// --- Wishlist ----------------------------------------------------------------

async function wishlistIdFor(db: Db, userId: string): Promise<string> {
  const existing = await db.first<{ id: string }>(
    `SELECT "id" FROM "wishlists" WHERE "userId" = ?`,
    userId,
  );
  if (existing) return existing.id;
  const id = newId();
  await db.run(`INSERT INTO "wishlists" ("id", "userId") VALUES (?, ?)`, id, userId);
  return id;
}

storefront.get('/account/wishlist', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const rows = await ctx.db.all(
    `SELECT wi."id", wi."productId", wi."variantId", wi."createdAt",
            p."name", p."slug", p."outletPriceMinor" AS "currentPriceMinor",
            p."originalPriceMinor", b."name" AS "brandName",
            (SELECT i."url" FROM "product_images" i WHERE i."productId" = p."id"
              ORDER BY i."position" LIMIT 1) AS "imageUrl",
            (SELECT COALESCE(SUM(MAX(0, ib."onHandQuantity" - ib."reservedQuantity")), 0)
               FROM "product_variants" v JOIN "inventory_balances" ib ON ib."variantId" = v."id"
              WHERE v."productId" = p."id" AND v."isEnabled" = 1) AS "totalAvailable"
       FROM "wishlist_items" wi
       JOIN "wishlists" w ON w."id" = wi."wishlistId"
       JOIN "products" p ON p."id" = wi."productId"
       JOIN "brands" b ON b."id" = p."brandId"
      WHERE w."userId" = ?
      ORDER BY wi."createdAt" DESC`,
    session.user.id,
  );
  return c.json(rows);
});

storefront.post('/account/wishlist', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(wishlistAddSchema, await readJson(c.req.raw));
  const wishlistId = await wishlistIdFor(ctx.db, session.user.id);
  await ctx.db.run(
    `INSERT INTO "wishlist_items" ("id", "wishlistId", "productId", "variantId")
     VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    newId(),
    wishlistId,
    body.productId,
    body.variantId ?? null,
  );
  return c.json({ ok: true }, 201);
});

storefront.delete('/account/wishlist/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const id = pathId(c.req.param('id'));
  // Matched by wishlist item id *or* product id, because the storefront's
  // heart toggle knows the product it is looking at, not the row id.
  const result = await ctx.db.run(
    `DELETE FROM "wishlist_items"
      WHERE ("id" = ? OR "productId" = ?)
        AND "wishlistId" IN (SELECT "id" FROM "wishlists" WHERE "userId" = ?)`,
    id,
    id,
    session.user.id,
  );
  if (Db.changes(result) === 0) throw notFound('That item is not on your wishlist.');
  return c.json({ ok: true });
});

// --- Orders ------------------------------------------------------------------

/**
 * Order history, as a bare array.
 *
 * That is the contract the NestJS API publishes and the one the storefront was
 * written against: the overview page does `orders.slice(0, 5)` and the history
 * page maps over the response directly. Returning the paginated envelope threw
 * on `.slice` and blanked both. Paging still works — `?page=`/`?pageSize=` are
 * honoured and the meta comes back in headers rather than wrapping the body.
 */
storefront.get('/account/orders', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const result = await listOrdersForCustomer(ctx.db, session.user.id, c.req.query());
  c.header('x-total-count', String(result.total));
  c.header('x-total-pages', String(result.totalPages));
  return c.json(result.items);
});

storefront.get('/account/orders/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const identifier = c.req.param('id');
  const order = await loadOrder(
    ctx.db,
    { userId: session.user.id, isStaff: false },
    identifier.startsWith('OUT-') ? { orderNumber: identifier } : { id: pathId(identifier) },
  );
  const [timeline, payments, shipments] = await Promise.all([
    orderTimeline(ctx.db, order.id),
    paymentsForOrder(ctx.db, order.id),
    shipmentsForOrder(ctx.db, order.id),
  ]);
  return c.json({ ...order, timeline, payments, shipments });
});

storefront.post('/account/orders/:id/cancel', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const order = await loadOrder(
    ctx.db,
    { userId: session.user.id, isStaff: false },
    {
      id: pathId(c.req.param('id')),
    },
  );

  // A customer may only cancel before it ships; after that it is a return.
  if (!['AWAITING_PAYMENT', 'PAID', 'PROCESSING'].includes(order.status)) {
    throw new ApiError('CONFLICT', 'This order can no longer be cancelled.');
  }

  const now = nowIso();
  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "orders" SET "status" = 'CANCELLED', "cancelledAt" = ?, "cancelReason" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?`,
      now,
      'Cancelled by customer',
      now,
      order.id,
      session.user.id,
    ),
    ctx.db.statement(
      `INSERT INTO "order_status_history" ("id", "orderId", "fromStatus", "toStatus", "note", "actorUserId", "createdAt")
       VALUES (?, ?, ?, 'CANCELLED', 'Cancelled by customer', ?, ?)`,
      newId(),
      order.id,
      order.status,
      session.user.id,
      now,
    ),
  ]);
  return c.json({ ok: true });
});

// --- Returns -----------------------------------------------------------------

storefront.get('/account/returns', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  return c.json(
    await ctx.db.all(
      `SELECT r."id", r."rmaNumber", r."status", r."reason", r."customerNote", r."createdAt",
              o."orderNumber", o."id" AS "orderId",
              (SELECT COALESCE(SUM(ri."quantity"), 0) FROM "return_items" ri
                WHERE ri."returnRequestId" = r."id") AS "itemCount",
              (SELECT COALESCE(SUM(rf."amountMinor"), 0) FROM "refunds" rf
                WHERE rf."returnRequestId" = r."id" AND rf."status" = 'SUCCEEDED') AS "refundedMinor"
         FROM "return_requests" r
         JOIN "orders" o ON o."id" = r."orderId"
        WHERE r."userId" = ?
        ORDER BY r."createdAt" DESC`,
      session.user.id,
    ),
  );
});

/**
 * Requesting a return.
 *
 * The order has to be the caller's, delivered, and the quantities have to be
 * within what is left unreturned on each line — all checked here against the
 * database, because the form that produced them is the least trustworthy
 * source of any of it.
 */
storefront.post('/account/returns', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(returnRequestSchema, await readJson(c.req.raw));

  const order = await ctx.db.first<{ id: string; status: string; orderNumber: string }>(
    `SELECT "id", "status", "orderNumber" FROM "orders" WHERE "id" = ? AND "userId" = ?`,
    body.orderId,
    session.user.id,
  );
  // 404 rather than 403: an order that is not yours is one you cannot see.
  if (!order) throw notFound('Order not found.');
  if (!['DELIVERED', 'PARTIALLY_RETURNED'].includes(order.status)) {
    throw new ApiError('CONFLICT', 'Only a delivered order can be returned.');
  }

  const ids = body.items.map((item) => item.orderItemId);
  const lines = await ctx.db.all<{ id: string; quantity: number; returnedQuantity: number }>(
    `SELECT "id", "quantity", "returnedQuantity" FROM "order_items"
      WHERE "orderId" = ? AND "id" IN (${ids.map(() => '?').join(', ')})`,
    order.id,
    ...ids,
  );
  if (lines.length !== ids.length) {
    throw new ApiError('BAD_REQUEST', 'Those items are not all on that order.');
  }

  for (const item of body.items) {
    const line = lines.find((row) => row.id === item.orderItemId)!;
    const remaining = line.quantity - line.returnedQuantity;
    if (item.quantity > remaining) {
      throw new ApiError('BAD_REQUEST', `Only ${remaining} of that item can still be returned.`);
    }
  }

  const rmaNumber = await nextRmaNumber(ctx.db);
  const returnId = newId();
  const now = nowIso();

  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "return_requests" ("id", "rmaNumber", "orderId", "userId", "status", "reason", "customerNote")
       VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?)`,
      returnId,
      rmaNumber,
      order.id,
      session.user.id,
      body.reason,
      body.customerNote ?? null,
    ),
    ...body.items.map((item) =>
      ctx.db.statement(
        `INSERT INTO "return_items" ("id", "returnRequestId", "orderItemId", "quantity") VALUES (?, ?, ?, ?)`,
        newId(),
        returnId,
        item.orderItemId,
        item.quantity,
      ),
    ),
    ctx.db.statement(
      `UPDATE "orders" SET "status" = 'RETURN_REQUESTED', "updatedAt" = ? WHERE "id" = ?`,
      now,
      order.id,
    ),
    ctx.db.statement(
      `INSERT INTO "order_status_history" ("id", "orderId", "fromStatus", "toStatus", "note", "actorUserId", "createdAt")
       VALUES (?, ?, ?, 'RETURN_REQUESTED', 'Return requested by the customer', ?, ?)`,
      newId(),
      order.id,
      order.status,
      session.user.id,
      now,
    ),
    ...notify(ctx.db, {
      userId: session.user.id,
      type: 'RETURN_REQUESTED',
      title: `Return requested for ${order.orderNumber}`,
      body: 'We have received your return request and will review it shortly.',
      email: session.user.email,
      orderId: order.id,
      template: 'return_requested',
      at: now,
    }),
  ]);

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'return.requested',
    entityType: 'ReturnRequest',
    entityId: returnId,
    after: { rmaNumber, orderId: order.id, orderNumber: order.orderNumber, reason: body.reason },
  });

  return c.json({ id: returnId, rmaNumber: rmaNumber, status: 'REQUESTED' }, 201);
});

// --- Notifications -----------------------------------------------------------

/**
 * The notification centre.
 *
 * Returned as `{ items, unreadCount }` rather than a bare array because the
 * inbox renders a count on the tab, and deriving it from a page capped at 50
 * would be wrong the moment somebody has more than fifty unread.
 */
storefront.get('/account/notifications', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const [items, unreadCount] = await Promise.all([
    ctx.db.all(
      `SELECT n."id", n."type", n."title", n."body", n."readAt", n."createdAt", o."orderNumber"
         FROM "notifications" n
         LEFT JOIN "orders" o ON o."id" = n."orderId"
        WHERE n."userId" = ? ORDER BY n."createdAt" DESC LIMIT 50`,
      session.user.id,
    ),
    ctx.db.count(
      `SELECT COUNT(*) AS "c" FROM "notifications" WHERE "userId" = ? AND "readAt" IS NULL`,
      session.user.id,
    ),
  ]);
  return c.json({ items, unreadCount });
});

/**
 * The simulated mailbox.
 *
 * There is no email provider in this deployment and no SMTP transport in the
 * Worker at all, so the messages a real system would have sent are written to
 * `simulated_emails` and read back here. Nothing is transmitted to anybody.
 * See SECURITY.md — this is the deliberate substitute, not a stub.
 */
storefront.get('/account/inbox', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const [items, unreadCount] = await Promise.all([
    ctx.db.all(
      `SELECT e."id", e."to", e."subject", e."body", e."template", e."readAt", e."sentAt",
              o."orderNumber"
         FROM "simulated_emails" e
         LEFT JOIN "orders" o ON o."id" = e."orderId"
        WHERE e."userId" = ? ORDER BY e."sentAt" DESC LIMIT 50`,
      session.user.id,
    ),
    ctx.db.count(
      `SELECT COUNT(*) AS "c" FROM "simulated_emails" WHERE "userId" = ? AND "readAt" IS NULL`,
      session.user.id,
    ),
  ]);
  return c.json({ items, unreadCount });
});

storefront.post('/account/inbox/:id/read', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  await ctx.db.run(
    `UPDATE "simulated_emails" SET "readAt" = ? WHERE "id" = ? AND "userId" = ? AND "readAt" IS NULL`,
    nowIso(),
    pathId(c.req.param('id')),
    session.user.id,
  );
  return c.json({ ok: true });
});

storefront.post('/account/notifications/read-all', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  await ctx.db.run(
    `UPDATE "notifications" SET "readAt" = ? WHERE "userId" = ? AND "readAt" IS NULL`,
    nowIso(),
    session.user.id,
  );
  return c.json({ ok: true });
});

storefront.post('/account/notifications/:id/read', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  await ctx.db.run(
    `UPDATE "notifications" SET "readAt" = ? WHERE "id" = ? AND "userId" = ?`,
    nowIso(),
    pathId(c.req.param('id')),
    session.user.id,
  );
  return c.json({ ok: true });
});

// --- Reviews -----------------------------------------------------------------

/**
 * Writing a review.
 *
 * `isVerifiedPurchase` is decided here, from the reviewer's delivered orders,
 * so the badge cannot be claimed by the client. New reviews land as PENDING
 * and wait for a moderator, which is also why they do not move the product's
 * rating until they are published.
 */
storefront.post('/catalog/products/:slug/reviews', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(reviewSchema, await readJson(c.req.raw));
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'review', session.user.id);

  const product = await ctx.db.first<{ id: string }>(
    `SELECT "id" FROM "products" WHERE "slug" = ? AND "status" = 'ACTIVE'`,
    pathSlug(c.req.param('slug')),
  );
  if (!product) throw notFound('Product not found.');

  const purchased = await ctx.db.count(
    `SELECT COUNT(*) AS "c"
       FROM "order_items" oi
       JOIN "orders" o ON o."id" = oi."orderId"
       JOIN "product_variants" v ON v."id" = oi."variantId"
      WHERE o."userId" = ? AND v."productId" = ? AND o."status" IN ('DELIVERED', 'RETURN_REQUESTED', 'PARTIALLY_RETURNED')`,
    session.user.id,
    product.id,
  );

  const existing = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "product_reviews" WHERE "productId" = ? AND "userId" = ?`,
    product.id,
    session.user.id,
  );
  if (existing > 0) throw new ApiError('CONFLICT', 'You have already reviewed this product.');

  await ctx.db.run(
    `INSERT INTO "product_reviews"
       ("id", "productId", "userId", "authorName", "rating", "title", "body",
        "isVerifiedPurchase", "status")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    newId(),
    product.id,
    session.user.id,
    `${session.user.firstName} ${session.user.lastName.slice(0, 1)}.`,
    body.rating,
    body.title ?? null,
    body.body,
    purchased > 0 ? 1 : 0,
  );

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'review.submitted',
    entityType: 'ProductReview',
    entityId: product.id,
    after: {
      rating: body.rating,
      title: body.title ?? null,
      verifiedPurchase: purchased > 0,
    },
  });

  return c.json({ ok: true, status: 'PENDING' }, 201);
});

// --- Newsletter --------------------------------------------------------------

storefront.post('/newsletter/subscribe', async (c) => {
  const ctx = ctxOf(c);
  const body = parse(newsletterSchema, await readJson(c.req.raw));
  await ctx.db.run(
    `INSERT INTO "newsletter_subscriptions" ("id", "email", "source")
     VALUES (?, ?, 'storefront')
     ON CONFLICT ("email") DO UPDATE SET "unsubscribedAt" = NULL`,
    newId(),
    body.email,
  );
  // Always the same answer, subscribed or not: a different one would turn this
  // endpoint into a way to test whether an address is on the list.
  return c.json({ ok: true });
});

export { fromBool };
