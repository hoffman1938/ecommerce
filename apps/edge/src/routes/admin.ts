/**
 * The administration API.
 *
 * Every route here begins with `requirePermission`. That is not a convention
 * this file follows loosely — it is the only thing standing between a customer
 * session and the ability to reprice the catalogue. The admin panel hides
 * controls a user cannot operate, but hiding a button is presentation; the
 * check that matters happens here, against roles loaded from the database.
 *
 * Every mutation also writes an audit row, in the same batch as the change
 * where the change is batched, so "who did this" is answerable afterwards.
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { Permissions } from '@outlet/types';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';
import { ApiError, badRequest, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { Db, allowListed, fromBool, inClause, nowIso, toJson, type SqlValue } from '../lib/sql';
import { auditStatement, requirePermission, writeAudit } from '../auth/rbac';
import { adjustStock } from '../services/inventory';
import {
  canTransition,
  listOrdersForAdmin,
  loadOrder,
  orderTimeline,
  paymentsForOrder,
} from '../services/orders';
import { listCategoriesForAdmin, listContentPages } from '../services/navigation';
import { readSettings } from '../services/settings';
import { notify } from '../services/inbox';
import { assertUploadable, extensionFor } from './media';
import { enforceRateLimit } from '../http/rate-limit';
import {
  adminContentSchema,
  adminCouponSchema,
  adminInventorySchema,
  adminNoteSchema,
  adminOrderStatusSchema,
  adminProductPatchSchema,
  adminProductSchema,
  adminReviewContentSchema,
  adminReviewModerationSchema,
  adminReviewReplySchema,
  adminSettingSchema,
  adminSettingsBulkSchema,
  parse,
  pathId,
  pathSlug,
  readJson,
} from '../lib/validate';

export const admin = new Hono<AppEnv>();

// --- Dashboard ---------------------------------------------------------------

admin.get('/dashboard', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.DashboardView);
  const { db } = ctx;
  const now = nowIso();

  /*
   * Revenue counts orders that were actually paid for and not cancelled.
   * Including cancelled orders would make the number bigger and wrong, which
   * is the kind of dashboard figure that quietly destroys trust in all the
   * others.
   */
  const PAID_STATUSES = `('PAID','PROCESSING','PACKED','SHIPPED','DELIVERED','RETURN_REQUESTED','PARTIALLY_RETURNED')`;

  const [
    totals,
    lowStock,
    reservations,
    campaigns,
    returns,
    recentOrders,
    salesByDay,
    salesByBrand,
    salesByCampaign,
    lowStockVariants,
    counts,
  ] = await Promise.all([
    db.first<{ revenueMinor: number; orderCount: number }>(
      `SELECT COALESCE(SUM("totalMinor"), 0) AS "revenueMinor", COUNT(*) AS "orderCount"
           FROM "orders" WHERE "status" IN ${PAID_STATUSES}`,
    ),
    db.count(
      `SELECT COUNT(*) AS "c" FROM "inventory_balances" b
           JOIN "product_variants" v ON v."id" = b."variantId"
          WHERE v."isEnabled" = 1 AND b."onHandQuantity" - b."reservedQuantity" BETWEEN 1 AND 5`,
    ),
    db.first<{ active: number; expired: number }>(
      `SELECT SUM(CASE WHEN "status" IN ('ACTIVE','CHECKOUT_STARTED','PAYMENT_PROCESSING') AND "expiresAt" > ? THEN 1 ELSE 0 END) AS "active",
                SUM(CASE WHEN "status" = 'EXPIRED' THEN 1 ELSE 0 END) AS "expired"
           FROM "inventory_reservations"`,
      now,
    ),
    db.first<{ active: number; upcoming: number }>(
      `SELECT SUM(CASE WHEN "status" = 'ACTIVE' THEN 1 ELSE 0 END) AS "active",
                SUM(CASE WHEN "status" = 'SCHEDULED' THEN 1 ELSE 0 END) AS "upcoming"
           FROM "campaigns"`,
    ),
    db.count(
      `SELECT COUNT(*) AS "c" FROM "return_requests" WHERE "status" IN ('REQUESTED','APPROVED','RECEIVED')`,
    ),
    db.all(
      `SELECT "id", "orderNumber", "email", "totalMinor", "status", "placedAt"
           FROM "orders" ORDER BY "placedAt" DESC LIMIT 10`,
    ),
    db.all(
      `SELECT SUBSTR("placedAt", 1, 10) AS "day",
                COALESCE(SUM("totalMinor"), 0) AS "revenueMinor",
                COUNT(*) AS "orderCount"
           FROM "orders" WHERE "status" IN ${PAID_STATUSES}
          GROUP BY "day" ORDER BY "day" DESC LIMIT 30`,
    ),
    db.all(
      `SELECT b."name" AS "brandName", COALESCE(SUM(oi."totalMinor"), 0) AS "revenueMinor",
                COALESCE(SUM(oi."quantity"), 0) AS "unitsSold"
           FROM "order_items" oi
           JOIN "orders" o ON o."id" = oi."orderId"
           JOIN "product_variants" v ON v."id" = oi."variantId"
           JOIN "products" p ON p."id" = v."productId"
           JOIN "brands" b ON b."id" = p."brandId"
          WHERE o."status" IN ${PAID_STATUSES}
          GROUP BY b."id" ORDER BY "revenueMinor" DESC LIMIT 10`,
    ),
    db.all(
      `SELECT ca."title" AS "campaignTitle", COALESCE(SUM(oi."totalMinor"), 0) AS "revenueMinor",
                COALESCE(SUM(oi."quantity"), 0) AS "unitsSold"
           FROM "order_items" oi
           JOIN "orders" o ON o."id" = oi."orderId"
           JOIN "campaigns" ca ON ca."id" = oi."campaignId"
          WHERE o."status" IN ${PAID_STATUSES}
          GROUP BY ca."id" ORDER BY "revenueMinor" DESC LIMIT 10`,
    ),
    db.all(
      `SELECT v."id" AS "variantId", v."sku", p."name" AS "productName",
                MAX(0, b."onHandQuantity" - b."reservedQuantity") AS "availableQuantity"
           FROM "inventory_balances" b
           JOIN "product_variants" v ON v."id" = b."variantId"
           JOIN "products" p ON p."id" = v."productId"
          WHERE v."isEnabled" = 1 AND p."status" = 'ACTIVE'
            AND b."onHandQuantity" - b."reservedQuantity" BETWEEN 0 AND 5
          ORDER BY "availableQuantity", p."name" LIMIT 20`,
    ),
    db.first<{
      products: number;
      activeProducts: number;
      customers: number;
      reviews: number;
      pendingReviews: number;
      stockUnits: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM "products") AS "products",
                (SELECT COUNT(*) FROM "products" WHERE "status" = 'ACTIVE') AS "activeProducts",
                (SELECT COUNT(*) FROM "users") AS "customers",
                (SELECT COUNT(*) FROM "product_reviews") AS "reviews",
                (SELECT COUNT(*) FROM "product_reviews" WHERE "status" = 'PENDING') AS "pendingReviews",
                (SELECT COALESCE(SUM("onHandQuantity"), 0) FROM "inventory_balances") AS "stockUnits"`,
    ),
  ]);

  const orderCount = totals?.orderCount ?? 0;
  const revenueMinor = totals?.revenueMinor ?? 0;

  return c.json({
    revenueMinor,
    orderCount,
    averageOrderValueMinor: orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0,
    lowStockCount: lowStock,
    activeReservationCount: reservations?.active ?? 0,
    expiredReservationCount: reservations?.expired ?? 0,
    failedPaymentCount: await db.count(
      `SELECT COUNT(*) AS "c" FROM "payments" WHERE "status" = 'FAILED'`,
    ),
    activeCampaignCount: campaigns?.active ?? 0,
    upcomingCampaignCount: campaigns?.upcoming ?? 0,
    openReturnCount: returns,
    productCount: counts?.products ?? 0,
    activeProductCount: counts?.activeProducts ?? 0,
    customerCount: counts?.customers ?? 0,
    reviewCount: counts?.reviews ?? 0,
    pendingReviewCount: counts?.pendingReviews ?? 0,
    inventoryUnits: counts?.stockUnits ?? 0,
    recentOrders,
    salesByDay: salesByDay.reverse(),
    salesByBrand,
    salesByCampaign,
    lowStockVariants,
    // Named so nobody mistakes the figure on the dashboard for money taken.
    demoRevenue: true,
  });
});

// --- Products ----------------------------------------------------------------

const ADMIN_PRODUCT_SORTS = {
  newest: `p."createdAt" DESC`,
  name: `p."name" ASC`,
  price_asc: `p."outletPriceMinor" ASC`,
  price_desc: `p."outletPriceMinor" DESC`,
} as const;

admin.get('/products', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ProductsView);
  const query = c.req.query();

  const clauses: string[] = [];
  const bindings: SqlValue[] = [];
  if (query.status) {
    clauses.push(`p."status" = ?`);
    bindings.push(query.status);
  }
  if (query.q) {
    const needle = `%${query.q.toLowerCase()}%`;
    clauses.push(`(LOWER(p."name") LIKE ? OR LOWER(p."slug") LIKE ? OR LOWER(b."name") LIKE ?)`);
    bindings.push(needle, needle, needle);
  }
  if (query.brandId) {
    clauses.push(`p."brandId" = ?`);
    bindings.push(query.brandId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 25));
  const total = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "products" p JOIN "brands" b ON b."id" = p."brandId" ${where}`,
    ...bindings,
  );
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  const items = await ctx.db.all(
    `SELECT p."id", p."name", p."slug", p."status", p."targetGroup",
            p."originalPriceMinor", p."outletPriceMinor", p."currencyCode",
            p."createdAt", p."updatedAt", p."reviewCount",
            b."id" AS "brandId", b."name" AS "brandName",
            c."id" AS "categoryId", c."name" AS "categoryName",
            (SELECT COUNT(*) FROM "product_variants" v WHERE v."productId" = p."id") AS "variantCount",
            (SELECT COALESCE(SUM(MAX(0, ib."onHandQuantity" - ib."reservedQuantity")), 0)
               FROM "product_variants" v JOIN "inventory_balances" ib ON ib."variantId" = v."id"
              WHERE v."productId" = p."id") AS "availableQuantity",
            (SELECT i."url" FROM "product_images" i WHERE i."productId" = p."id"
              ORDER BY i."position" LIMIT 1) AS "imageUrl"
       FROM "products" p
       JOIN "brands" b ON b."id" = p."brandId"
       LEFT JOIN "categories" c ON c."id" = p."categoryId"
       ${where}
       ORDER BY ${allowListed(query.sort, ADMIN_PRODUCT_SORTS, 'newest')}
       LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );

  /*
   * The listing needs each product's variants with their stock, because it
   * totals availability per row. Fetched in one query for the whole page
   * rather than per product — 25 rows would otherwise be 25 round-trips, and
   * D1 charges for each.
   */
  const productIds = items.map((row) => (row as { id: string }).id);
  const { sql: idList, bindings: idBindings } = inClause(productIds);
  const variants = await ctx.db.all<{
    id: string;
    productId: string;
    sku: string;
    isEnabled: number;
    onHandQuantity: number | null;
    reservedQuantity: number | null;
  }>(
    `SELECT v."id", v."productId", v."sku", v."isEnabled",
            ib."onHandQuantity", ib."reservedQuantity"
       FROM "product_variants" v
       LEFT JOIN "inventory_balances" ib ON ib."variantId" = v."id"
      WHERE v."productId" IN ${idList}
      ORDER BY v."position"`,
    ...idBindings,
  );

  const byProduct = new Map<string, unknown[]>();
  for (const variant of variants) {
    const list = byProduct.get(variant.productId) ?? [];
    list.push({
      id: variant.id,
      sku: variant.sku,
      isEnabled: fromBool(variant.isEnabled),
      // Nested, and null when a variant has no balance row — exactly what the
      // panel's `v.inventory?.onHandQuantity ?? 0` is written against.
      inventory:
        variant.onHandQuantity === null
          ? null
          : {
              onHandQuantity: variant.onHandQuantity,
              reservedQuantity: variant.reservedQuantity ?? 0,
            },
    });
    byProduct.set(variant.productId, list);
  }

  return c.json({
    items: items.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ...record,
        // `brand.name` and `category.name`, as the panel reads them.
        brand: { id: record.brandId, name: record.brandName },
        category: record.categoryId ? { id: record.categoryId, name: record.categoryName } : null,
        variants: byProduct.get(record.id as string) ?? [],
      };
    }),
    total,
    page,
    pageSize,
    totalPages,
  });
});

admin.get('/products/:id', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ProductsView);
  const id = pathId(c.req.param('id'));

  const product = await ctx.db.first(
    `SELECT p.*, b."name" AS "brandName", c."name" AS "categoryName"
       FROM "products" p
       JOIN "brands" b ON b."id" = p."brandId"
       LEFT JOIN "categories" c ON c."id" = p."categoryId"
      WHERE p."id" = ?`,
    id,
  );
  if (!product) throw notFound('Product not found.');

  const [variants, images] = await Promise.all([
    ctx.db.all(
      `SELECT v."id", v."sku", v."barcode", v."size", v."color", v."priceOverrideMinor",
              v."isEnabled", v."position",
              COALESCE(b."onHandQuantity", 0) AS "onHandQuantity",
              COALESCE(b."reservedQuantity", 0) AS "reservedQuantity",
              MAX(0, COALESCE(b."onHandQuantity", 0) - COALESCE(b."reservedQuantity", 0)) AS "availableQuantity"
         FROM "product_variants" v
         LEFT JOIN "inventory_balances" b ON b."variantId" = v."id"
        WHERE v."productId" = ? ORDER BY v."position"`,
      id,
    ),
    ctx.db.all(
      `SELECT "id", "url", "objectKey", "altText", "position", "variantId"
         FROM "product_images" WHERE "productId" = ? ORDER BY "position"`,
      id,
    ),
  ]);

  return c.json({ ...product, variants, images });
});

admin.post('/products', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsCreate);
  const body = parse(adminProductSchema, await readJson(c.req.raw));

  const id = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "products"
         ("id", "name", "slug", "brandId", "categoryId", "shortDescription", "description",
          "targetGroup", "materials", "careInstructions", "countryOfOrigin",
          "originalPriceMinor", "outletPriceMinor", "status", "taxClass", "seoTitle",
          "seoDescription", "searchKeywords", "publishedFrom")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      body.name,
      body.slug,
      body.brandId,
      body.categoryId ?? null,
      body.shortDescription ?? null,
      body.description ?? null,
      body.targetGroup,
      body.materials ?? null,
      body.careInstructions ?? null,
      body.countryOfOrigin ?? null,
      body.originalPriceMinor,
      body.outletPriceMinor,
      body.status,
      body.taxClass,
      body.seoTitle ?? null,
      body.seoDescription ?? null,
      body.searchKeywords ?? null,
      body.status === 'ACTIVE' ? nowIso() : null,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'product.create',
      entityType: 'Product',
      entityId: id,
      after: body,
    }),
  ]);

  return c.json({ id, ...body }, 201);
});

/**
 * Editing a product.
 *
 * Registered for PUT and PATCH alike. The panel's edit form sends a complete
 * product, its list view sends `{ status }` from a dropdown, and both arrive
 * as PUT — so the handler takes whatever subset is offered, lays it over the
 * stored row, and validates the result as a whole. That ordering is what makes
 * `{ outletPriceMinor }` on its own still answerable against the original
 * price it is not sending.
 */
const updateProduct = async (c: Context<AppEnv>) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const id = pathId(c.req.param('id'));
  const patch = parse(adminProductPatchSchema, await readJson(c.req.raw));

  const before = await ctx.db.first<Record<string, SqlValue>>(
    `SELECT * FROM "products" WHERE "id" = ?`,
    id,
  );
  if (!before) throw notFound('Product not found.');

  const body = parse(adminProductSchema, {
    name: before.name,
    slug: before.slug,
    brandId: before.brandId,
    categoryId: before.categoryId,
    shortDescription: before.shortDescription,
    description: before.description,
    targetGroup: before.targetGroup,
    materials: before.materials,
    careInstructions: before.careInstructions,
    countryOfOrigin: before.countryOfOrigin,
    originalPriceMinor: before.originalPriceMinor,
    outletPriceMinor: before.outletPriceMinor,
    status: before.status,
    taxClass: before.taxClass,
    seoTitle: before.seoTitle,
    seoDescription: before.seoDescription,
    searchKeywords: before.searchKeywords,
    ...patch,
  });

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "products"
          SET "name" = ?, "slug" = ?, "brandId" = ?, "categoryId" = ?, "shortDescription" = ?,
              "description" = ?, "targetGroup" = ?, "materials" = ?, "careInstructions" = ?,
              "countryOfOrigin" = ?, "originalPriceMinor" = ?, "outletPriceMinor" = ?,
              "status" = ?, "taxClass" = ?, "seoTitle" = ?, "seoDescription" = ?,
              "searchKeywords" = ?,
              "publishedFrom" = CASE WHEN ? = 'ACTIVE' THEN COALESCE("publishedFrom", ?) ELSE "publishedFrom" END,
              "version" = "version" + 1, "updatedAt" = ?
        WHERE "id" = ?`,
      body.name,
      body.slug,
      body.brandId,
      body.categoryId ?? null,
      body.shortDescription ?? null,
      body.description ?? null,
      body.targetGroup,
      body.materials ?? null,
      body.careInstructions ?? null,
      body.countryOfOrigin ?? null,
      body.originalPriceMinor,
      body.outletPriceMinor,
      body.status,
      body.taxClass,
      body.seoTitle ?? null,
      body.seoDescription ?? null,
      body.searchKeywords ?? null,
      body.status,
      nowIso(),
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      before,
      after: body,
    }),
  ]);

  return c.json({ id, ...body });
};

admin.put('/products/:id', updateProduct);
admin.patch('/products/:id', updateProduct);

/**
 * Archiving, not deleting.
 *
 * Orders reference variants, and reviews reference products. Removing the row
 * would either cascade into somebody's order history or be refused by a
 * foreign key; archiving takes it off the storefront and leaves the record
 * intact, which is what a real shop does with discontinued stock.
 */
admin.post('/products/:id/archive', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsArchive);
  const id = pathId(c.req.param('id'));

  const before = await ctx.db.first<{ status: string }>(
    `SELECT "status" FROM "products" WHERE "id" = ?`,
    id,
  );
  if (!before) throw notFound('Product not found.');

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "products" SET "status" = 'ARCHIVED', "archivedAt" = ?, "updatedAt" = ? WHERE "id" = ?`,
      nowIso(),
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'product.archive',
      entityType: 'Product',
      entityId: id,
      before,
      after: { status: 'ARCHIVED' },
    }),
  ]);
  return c.json({ ok: true });
});

// --- Categories and brands ---------------------------------------------------

admin.get('/categories', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ProductsView);
  return c.json(await listCategoriesForAdmin(ctx.db));
});

admin.get('/brands', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ProductsView);
  return c.json(
    await ctx.db.all(
      `SELECT b."id", b."name", b."slug", b."description", b."isFeatured", b."isActive",
              COUNT(p."id") AS "productCount"
         FROM "brands" b
         LEFT JOIN "products" p ON p."brandId" = b."id"
        GROUP BY b."id" ORDER BY b."name"`,
    ),
  );
});

// --- Inventory ---------------------------------------------------------------

admin.get('/inventory', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.InventoryView);
  const query = c.req.query();

  const clauses: string[] = [];
  const bindings: SqlValue[] = [];
  if (query.q) {
    const needle = `%${query.q.toLowerCase()}%`;
    clauses.push(`(LOWER(v."sku") LIKE ? OR LOWER(p."name") LIKE ?)`);
    bindings.push(needle, needle);
  }
  if (query.lowStock === 'true') {
    clauses.push(`b."onHandQuantity" - b."reservedQuantity" <= 5`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const pageSize = Math.max(1, Math.min(200, Number(query.pageSize) || 50));
  const total = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "inventory_balances" b
       JOIN "product_variants" v ON v."id" = b."variantId"
       JOIN "products" p ON p."id" = v."productId" ${where}`,
    ...bindings,
  );
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  const rows = await ctx.db.all<Record<string, unknown>>(
    `SELECT v."id" AS "variantId", v."sku", v."size", v."color", v."isEnabled",
            p."id" AS "productId", p."name" AS "productName", br."name" AS "brandName",
            b."onHandQuantity", b."reservedQuantity", b."soldQuantity", b."damagedQuantity",
            b."returnedQuantity",
            MAX(0, b."onHandQuantity" - b."reservedQuantity") AS "availableQuantity"
       FROM "inventory_balances" b
       JOIN "product_variants" v ON v."id" = b."variantId"
       JOIN "products" p ON p."id" = v."productId"
       JOIN "brands" br ON br."id" = p."brandId"
       ${where}
       ORDER BY "availableQuantity", p."name", v."sku"
       LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );

  return c.json({
    items: rows.map((row) => ({ ...row, isEnabled: fromBool(row.isEnabled) })),
    total,
    page,
    pageSize,
    totalPages,
  });
});

admin.patch('/inventory/:variantId', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.InventoryAdjust);
  const variantId = pathId(c.req.param('variantId'), 'variant id');
  const body = parse(adminInventorySchema, await readJson(c.req.raw));

  const result = await adjustStock(ctx.db, {
    variantId,
    newOnHand: body.onHandQuantity,
    reason: body.reason,
    actorUserId: session.user.id,
    type: body.type,
  });

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'inventory.adjust',
    entityType: 'InventoryBalance',
    entityId: variantId,
    before: { onHandQuantity: result.previousOnHand },
    after: { onHandQuantity: result.newOnHand },
    reason: body.reason,
  });

  return c.json(result);
});

admin.get('/inventory/:variantId/movements', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.InventoryView);
  return c.json(
    await ctx.db.all(
      `SELECT m."id", m."variantId", v."sku", m."type", m."quantityChange", m."previousOnHand",
              m."newOnHand", m."reason", u."email" AS "actorEmail", m."createdAt"
         FROM "inventory_movements" m
         JOIN "product_variants" v ON v."id" = m."variantId"
         LEFT JOIN "users" u ON u."id" = m."actorUserId"
        WHERE m."variantId" = ? ORDER BY m."createdAt" DESC LIMIT 100`,
      pathId(c.req.param('variantId'), 'variant id'),
    ),
  );
});

admin.get('/reservations', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ReservationsView);
  return c.json(
    await ctx.db.all(
      `SELECT r."id", v."sku", p."name" AS "productName", r."quantity", r."status",
              u."email" AS "customerEmail", r."createdAt", r."expiresAt"
         FROM "inventory_reservations" r
         JOIN "product_variants" v ON v."id" = r."variantId"
         JOIN "products" p ON p."id" = v."productId"
         LEFT JOIN "users" u ON u."id" = r."userId"
        ORDER BY r."createdAt" DESC LIMIT 100`,
    ),
  );
});

// --- Orders ------------------------------------------------------------------

admin.get('/orders', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.OrdersView);
  return c.json(await listOrdersForAdmin(ctx.db, c.req.query()));
});

admin.get('/orders/:id', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.OrdersView);
  const order = await loadOrder(
    ctx.db,
    { userId: null, isStaff: true },
    {
      id: pathId(c.req.param('id')),
    },
  );
  const [timeline, payments, movements, refunds] = await Promise.all([
    orderTimeline(ctx.db, order.id),
    paymentsForOrder(ctx.db, order.id),
    // What this order did to stock — the "view inventory effects" the admin
    // screen offers, answered from the ledger rather than inferred.
    ctx.db.all(
      `SELECT m."id", v."sku", m."type", m."quantityChange", m."previousOnHand", m."newOnHand", m."createdAt"
         FROM "inventory_movements" m
         JOIN "product_variants" v ON v."id" = m."variantId"
        WHERE m."orderId" = ? ORDER BY m."createdAt"`,
      order.id,
    ),
    /*
     * Money already sent back. The order screen lists these under the totals
     * and reads `order.refunds.length` before anything else, so omitting them
     * threw during render — the whole screen, not just the refunds panel.
     */
    ctx.db.all(
      `SELECT "id", "amountMinor", "status", "reason", "providerRefundId", "createdAt"
         FROM "refunds" WHERE "orderId" = ? ORDER BY "createdAt" DESC`,
      order.id,
    ),
  ]);

  return c.json({
    ...order,
    timeline,
    // The same rows under the name the screen reads them by. `timeline` is
    // this API's vocabulary; `statusHistory` is the panel's, and it maps over
    // it directly.
    statusHistory: timeline,
    payments,
    refunds,
    inventoryMovements: movements,
  });
});

/*
 * Registered for POST as well as PATCH.
 *
 * The order detail screen POSTs here — it is the only way to advance an order
 * through the panel — and the route existed only as PATCH, so every status
 * change returned "No such endpoint." Fulfilment could not be driven at all.
 */
const changeOrderStatus = async (c: Context<AppEnv>) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.OrdersUpdate);
  const id = pathId(c.req.param('id'));
  const body = parse(adminOrderStatusSchema, await readJson(c.req.raw));

  const order = await ctx.db.first<{
    status: string;
    userId: string | null;
    orderNumber: string;
    email: string;
  }>(`SELECT "status", "userId", "orderNumber", "email" FROM "orders" WHERE "id" = ?`, id);
  if (!order) throw notFound('Order not found.');

  // The state machine, enforced server-side: without it an admin-panel bug
  // could walk a delivered order back to awaiting-payment.
  if (!canTransition(order.status, body.status)) {
    throw new ApiError('CONFLICT', `An order cannot move from ${order.status} to ${body.status}.`);
  }

  const now = nowIso();
  const statements = [
    ctx.db.statement(
      `UPDATE "orders" SET "status" = ?, "updatedAt" = ?, "version" = "version" + 1,
              "cancelledAt" = CASE WHEN ? = 'CANCELLED' THEN ? ELSE "cancelledAt" END
        WHERE "id" = ?`,
      body.status,
      now,
      body.status,
      now,
      id,
    ),
    ctx.db.statement(
      `INSERT INTO "order_status_history" ("id", "orderId", "fromStatus", "toStatus", "note", "actorUserId", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      id,
      order.status,
      body.status,
      body.note ?? null,
      session.user.id,
      now,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'order.status_change',
      entityType: 'Order',
      entityId: id,
      before: { status: order.status },
      after: { status: body.status },
      reason: body.note ?? null,
    }),
  ];

  /*
   * Dispatch, recorded rather than dropped.
   *
   * The panel collects a carrier and a tracking number when an order ships,
   * and until now both were discarded: the schema rejected them and the
   * `shipments` table was only ever written by the seed. A customer looking at
   * a shipped order saw no way to track it.
   *
   * Upserted by order rather than inserted, so correcting a mistyped tracking
   * number updates the consignment instead of creating a second one.
   */
  if (body.status === 'SHIPPED' || body.status === 'DELIVERED') {
    const existing = await ctx.db.first<{ id: string }>(
      `SELECT "id" FROM "shipments" WHERE "orderId" = ? ORDER BY "createdAt" LIMIT 1`,
      id,
    );
    const shipmentId = existing?.id ?? newId();
    const delivered = body.status === 'DELIVERED';

    statements.push(
      existing
        ? ctx.db.statement(
            `UPDATE "shipments"
                SET "carrier" = COALESCE(?, "carrier"),
                    "trackingNumber" = COALESCE(?, "trackingNumber"),
                    "status" = ?,
                    "shippedAt" = COALESCE("shippedAt", ?),
                    "deliveredAt" = CASE WHEN ? THEN ? ELSE "deliveredAt" END,
                    "updatedAt" = ?
              WHERE "id" = ?`,
            body.carrier ?? null,
            body.trackingNumber ?? null,
            body.status,
            now,
            delivered ? 1 : 0,
            now,
            now,
            shipmentId,
          )
        : ctx.db.statement(
            `INSERT INTO "shipments"
               ("id", "orderId", "carrier", "trackingNumber", "status", "shippedAt", "deliveredAt", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            shipmentId,
            id,
            body.carrier ?? null,
            body.trackingNumber ?? null,
            body.status,
            now,
            delivered ? now : null,
            now,
            now,
          ),
      ctx.db.statement(
        `INSERT INTO "shipment_events" ("id", "shipmentId", "code", "label", "occurredAt")
         VALUES (?, ?, ?, ?, ?)`,
        newId(),
        shipmentId,
        delivered ? 'DELIVERED' : 'SHIPPED',
        delivered ? 'Delivered' : 'Handed to carrier',
        now,
      ),
    );
  }

  if (order.userId) {
    const tracking = body.trackingNumber
      ? ` Tracking number ${body.trackingNumber}${body.carrier ? ` (${body.carrier})` : ''}.`
      : '';
    statements.push(
      ...notify(ctx.db, {
        userId: order.userId,
        type: 'ORDER_STATUS',
        title: `Order ${order.orderNumber} updated`,
        body: `Your order is now ${body.status.toLowerCase().replace(/_/g, ' ')}.${tracking}`,
        email: order.email,
        orderId: id,
        template: 'order_status',
        at: now,
      }),
    );
  }

  await ctx.db.batch(statements);
  return c.json({ ok: true, status: body.status });
};

admin.post('/orders/:id/status', changeOrderStatus);
admin.patch('/orders/:id/status', changeOrderStatus);

admin.patch('/orders/:id/note', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.OrdersUpdate);
  const id = pathId(c.req.param('id'));
  const body = parse(adminNoteSchema, await readJson(c.req.raw));

  const result = await ctx.db.run(
    `UPDATE "orders" SET "internalNote" = ?, "updatedAt" = ? WHERE "id" = ?`,
    body.internalNote,
    nowIso(),
    id,
  );
  if (Db.changes(result) === 0) throw notFound('Order not found.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'order.note',
    entityType: 'Order',
    entityId: id,
  });
  return c.json({ ok: true });
});

// --- Customers ---------------------------------------------------------------

admin.get('/customers', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.CustomersView);
  const query = c.req.query();

  const clauses: string[] = [];
  const bindings: SqlValue[] = [];
  if (query.q) {
    const needle = `%${query.q.toLowerCase()}%`;
    clauses.push(`(LOWER(u."email") LIKE ? OR LOWER(u."firstName" || ' ' || u."lastName") LIKE ?)`);
    bindings.push(needle, needle);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 25));
  const total = await ctx.db.count(`SELECT COUNT(*) AS "c" FROM "users" u ${where}`, ...bindings);
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  const items = await ctx.db.all(
    `SELECT u."id", u."email", u."firstName", u."lastName", u."status", u."createdAt",
            u."isEmailVerified",
            (SELECT COUNT(*) FROM "orders" o WHERE o."userId" = u."id") AS "orderCount",
            (SELECT COALESCE(SUM(o."totalMinor"), 0) FROM "orders" o
              WHERE o."userId" = u."id" AND o."status" <> 'CANCELLED') AS "lifetimeValueMinor",
            (SELECT GROUP_CONCAT(r."name") FROM "user_roles" ur
               JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = u."id") AS "roleNames"
       FROM "users" u ${where}
       ORDER BY u."createdAt" DESC LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );

  return c.json({
    items: items.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ...record,
        isEmailVerified: fromBool(record.isEmailVerified),
        roles: ((record.roleNames as string | null) ?? '').split(',').filter(Boolean),
        // The panel renders `customer._count.orders`, the shape Prisma gives it
        // against the NestJS API. Emitting only the flat `orderCount` read as
        // undefined and took the whole customers page down with a client-side
        // exception. Both are sent; the flat one is what SQL produced.
        _count: { orders: Number(record.orderCount ?? 0) },
      };
    }),
    total,
    page,
    pageSize,
    totalPages,
  });
});

admin.get('/customers/:id', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.CustomersView);
  const id = pathId(c.req.param('id'));

  const customer = await ctx.db.first(
    `SELECT "id", "email", "firstName", "lastName", "status", "isEmailVerified",
            "newsletterOptIn", "disabledReason", "createdAt"
       FROM "users" WHERE "id" = ?`,
    id,
  );
  if (!customer) throw notFound('Customer not found.');

  const [orders, addresses, notes, roles, returnRequests, refunds] = await Promise.all([
    ctx.db.all(
      `SELECT "id", "orderNumber", "status", "totalMinor", "placedAt"
         FROM "orders" WHERE "userId" = ? ORDER BY "placedAt" DESC LIMIT 25`,
      id,
    ),
    ctx.db.all(
      `SELECT "id", "line1", "city", "postalCode", "countryCode" FROM "addresses" WHERE "userId" = ?`,
      id,
    ),
    ctx.db.all(
      `SELECT n."id", n."note", n."createdAt", a."email" AS "authorEmail"
         FROM "customer_support_notes" n
         LEFT JOIN "users" a ON a."id" = n."authorId"
        WHERE n."userId" = ? ORDER BY n."createdAt" DESC`,
      id,
    ),
    ctx.db.all(
      `SELECT r."name" FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = ?`,
      id,
    ),
    /*
     * Returns and refunds for this customer. The support screen renders both
     * panels and reads `.length` on each before rendering anything, so their
     * absence threw and blanked the page rather than showing empty sections.
     */
    ctx.db.all(
      `SELECT r."id", r."rmaNumber", r."status", r."createdAt", o."orderNumber"
         FROM "return_requests" r
         JOIN "orders" o ON o."id" = r."orderId"
        WHERE r."userId" = ? ORDER BY r."createdAt" DESC LIMIT 25`,
      id,
    ),
    ctx.db.all(
      `SELECT rf."id", rf."amountMinor", rf."status", rf."reason", rf."createdAt",
              o."orderNumber"
         FROM "refunds" rf
         JOIN "orders" o ON o."id" = rf."orderId"
        WHERE o."userId" = ? ORDER BY rf."createdAt" DESC LIMIT 25`,
      id,
    ),
  ]);

  return c.json({
    ...customer,
    orders,
    addresses,
    notes,
    // `supportNotes` is the name the screen binds to; `notes` is this API's.
    supportNotes: notes,
    returnRequests,
    refunds,
    roles: roles.map((r) => (r as { name: string }).name),
  });
});

admin.post('/customers/:id/notes', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CustomersSupport);
  const id = pathId(c.req.param('id'));
  const body = parse(adminNoteSchema, await readJson(c.req.raw));

  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "customer_support_notes" ("id", "userId", "authorId", "note") VALUES (?, ?, ?, ?)`,
      newId(),
      id,
      session.user.id,
      body.internalNote,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'customer.support_note',
      entityType: 'User',
      entityId: id,
    }),
  ]);
  return c.json({ ok: true }, 201);
});

// --- Reviews -----------------------------------------------------------------

/**
 * A moderation-queue row, joined flat and reshaped here.
 *
 * The queue shows who wrote a review, who replied to it and who last moderated
 * it, which is four tables. SQL returns that as one flat row; the panel binds
 * to `review.product.slug` and `review.moderatedBy.email`, so the nesting is
 * rebuilt on the way out rather than by four extra round-trips per row.
 */
interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  status: string;
  isVerifiedPurchase: number;
  helpfulCount: number;
  reportCount: number;
  adminReply: string | null;
  adminReplyAt: string | null;
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string | null;
  userEmail: string | null;
  adminReplyById: string | null;
  adminReplyByEmail: string | null;
  moderatedById: string | null;
  moderatedByEmail: string | null;
}

const actor = (id: string | null, email: string | null) => (id && email ? { id, email } : null);

const toReviewDto = (row: ReviewRow) => ({
  id: row.id,
  rating: row.rating,
  title: row.title,
  body: row.body,
  authorName: row.authorName,
  status: row.status,
  isVerifiedPurchase: fromBool(row.isVerifiedPurchase),
  helpfulCount: row.helpfulCount,
  reportCount: row.reportCount,
  adminReply: row.adminReply,
  adminReplyAt: row.adminReplyAt,
  moderationNote: row.moderationNote,
  moderatedAt: row.moderatedAt,
  createdAt: row.createdAt,
  product: { id: row.productId, name: row.productName, slug: row.productSlug },
  user: actor(row.userId, row.userEmail),
  adminReplyBy: actor(row.adminReplyById, row.adminReplyByEmail),
  moderatedBy: actor(row.moderatedById, row.moderatedByEmail),
});

admin.get('/reviews', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ReviewsView);
  const query = c.req.query();

  const clauses: string[] = [];
  const bindings: SqlValue[] = [];
  if (query.status) {
    clauses.push(`r."status" = ?`);
    bindings.push(query.status);
  }
  if (query.reported === 'true') clauses.push(`r."reportCount" > 0`);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 25));
  const total = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "product_reviews" r ${where}`,
    ...bindings,
  );
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  const rows = await ctx.db.all<ReviewRow>(
    `SELECT r."id", r."rating", r."title", r."body", r."authorName", r."status",
            r."isVerifiedPurchase", r."helpfulCount", r."reportCount",
            r."adminReply", r."adminReplyAt", r."moderationNote", r."moderatedAt", r."createdAt",
            p."id" AS "productId", p."name" AS "productName", p."slug" AS "productSlug",
            u."id" AS "userId", u."email" AS "userEmail",
            ar."id" AS "adminReplyById", ar."email" AS "adminReplyByEmail",
            mb."id" AS "moderatedById", mb."email" AS "moderatedByEmail"
       FROM "product_reviews" r
       JOIN "products" p ON p."id" = r."productId"
       LEFT JOIN "users" u ON u."id" = r."userId"
       LEFT JOIN "users" ar ON ar."id" = r."adminReplyByUserId"
       LEFT JOIN "users" mb ON mb."id" = r."moderatedByUserId"
       ${where}
       ORDER BY r."reportCount" DESC, r."createdAt" DESC
       LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );

  return c.json({ items: rows.map(toReviewDto), total, page, pageSize, totalPages });
});

/**
 * Moderating a review.
 *
 * The product's denormalised rating is recomputed from the rows in the same
 * batch, so hiding a one-star review moves the average immediately rather than
 * leaving the product page contradicting the moderation queue.
 */
/**
 * Editing the text of a review.
 *
 * Changing what somebody else wrote is a heavier act than deciding whether it
 * is shown, so it takes `reviews.delete` — the permission for removing it —
 * rather than `reviews.moderate`, and the previous text goes into the audit
 * row. The rating is untouched: a moderator fixes wording, not a score.
 */
async function editReviewContent(c: Context<AppEnv>, raw: unknown) {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReviewsDelete);
  const id = pathId(c.req.param('id'));
  const body = parse(adminReviewContentSchema, raw);

  const before = await ctx.db.first<{ title: string | null; body: string }>(
    `SELECT "title", "body" FROM "product_reviews" WHERE "id" = ?`,
    id,
  );
  if (!before) throw notFound('Review not found.');

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "product_reviews" SET "title" = ?, "body" = ?, "updatedAt" = ? WHERE "id" = ?`,
      body.title ?? null,
      body.body,
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'review.edit',
      entityType: 'ProductReview',
      entityId: id,
      before,
      after: { title: body.title ?? null, body: body.body },
    }),
  ]);
  return c.json({ ok: true });
}

admin.patch('/reviews/:id', async (c) => {
  const ctx = ctxOf(c);
  const id = pathId(c.req.param('id'));
  const raw = await readJson(c.req.raw);

  /*
   * Two different edits arrive on this path: the moderation queue sends a
   * `status`, and the review editor sends the `body` it rewrote. They need
   * different permissions, so the shape decides which handler runs rather than
   * one schema accepting both and the stricter check being skipped.
   */
  if (raw && typeof raw === 'object' && 'body' in raw) return editReviewContent(c, raw);

  const session = requirePermission(ctx.session, Permissions.ReviewsModerate);
  const body = parse(adminReviewModerationSchema, raw);

  const review = await ctx.db.first<{ productId: string; status: string }>(
    `SELECT "productId", "status" FROM "product_reviews" WHERE "id" = ?`,
    id,
  );
  if (!review) throw notFound('Review not found.');

  const now = nowIso();
  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "product_reviews"
          SET "status" = ?, "moderationNote" = ?, "moderatedAt" = ?, "moderatedByUserId" = ?, "updatedAt" = ?
        WHERE "id" = ?`,
      body.status,
      body.moderationNote ?? null,
      now,
      session.user.id,
      now,
      id,
    ),
    ctx.db.statement(
      `UPDATE "products"
          SET "ratingSum" = (SELECT COALESCE(SUM("rating"), 0) FROM "product_reviews"
                              WHERE "productId" = ? AND "status" = 'PUBLISHED'),
              "reviewCount" = (SELECT COUNT(*) FROM "product_reviews"
                                WHERE "productId" = ? AND "status" = 'PUBLISHED'),
              "updatedAt" = ?
        WHERE "id" = ?`,
      review.productId,
      review.productId,
      now,
      review.productId,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'review.moderate',
      entityType: 'ProductReview',
      entityId: id,
      before: { status: review.status },
      after: { status: body.status },
      reason: body.moderationNote ?? null,
    }),
  ]);

  return c.json({ ok: true, status: body.status });
});

admin.post('/reviews/:id/reply', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReviewsReply);
  const id = pathId(c.req.param('id'));
  const body = parse(adminReviewReplySchema, await readJson(c.req.raw));

  const result = await ctx.db.run(
    `UPDATE "product_reviews" SET "adminReply" = ?, "adminReplyAt" = ?, "adminReplyByUserId" = ?, "updatedAt" = ? WHERE "id" = ?`,
    body.adminReply,
    nowIso(),
    session.user.id,
    nowIso(),
    id,
  );
  if (Db.changes(result) === 0) throw notFound('Review not found.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'review.reply',
    entityType: 'ProductReview',
    entityId: id,
  });
  return c.json({ ok: true });
});

/**
 * Withdrawing a merchant reply.
 *
 * The reply is public text on the product page, so removing it clears the
 * attribution with it — leaving `adminReplyByUserId` set would keep naming an
 * author for something no longer said.
 */
admin.delete('/reviews/:id/reply', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReviewsReply);
  const id = pathId(c.req.param('id'));

  const before = await ctx.db.first<{ adminReply: string | null }>(
    `SELECT "adminReply" FROM "product_reviews" WHERE "id" = ?`,
    id,
  );
  if (!before) throw notFound('Review not found.');

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "product_reviews"
          SET "adminReply" = NULL, "adminReplyAt" = NULL, "adminReplyByUserId" = NULL, "updatedAt" = ?
        WHERE "id" = ?`,
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'review.reply_withdraw',
      entityType: 'ProductReview',
      entityId: id,
      before,
    }),
  ]);
  return c.json({ ok: true });
});

/**
 * Deleting a review outright.
 *
 * The rating is denormalised onto the product, so the row cannot simply go: the
 * average and the count are recomputed in the same batch, or the product page
 * would keep advertising a review that no longer exists.
 */
admin.delete('/reviews/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReviewsDelete);
  const id = pathId(c.req.param('id'));

  const before = await ctx.db.first<{ productId: string; rating: number; body: string }>(
    `SELECT "productId", "rating", "body" FROM "product_reviews" WHERE "id" = ?`,
    id,
  );
  if (!before) throw notFound('Review not found.');

  const now = nowIso();
  await ctx.db.batch([
    ctx.db.statement(`DELETE FROM "product_reviews" WHERE "id" = ?`, id),
    ctx.db.statement(
      `UPDATE "products"
          SET "ratingSum" = (SELECT COALESCE(SUM("rating"), 0) FROM "product_reviews"
                              WHERE "productId" = ? AND "status" = 'PUBLISHED'),
              "reviewCount" = (SELECT COUNT(*) FROM "product_reviews"
                                WHERE "productId" = ? AND "status" = 'PUBLISHED'),
              "updatedAt" = ?
        WHERE "id" = ?`,
      before.productId,
      before.productId,
      now,
      before.productId,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'review.delete',
      entityType: 'ProductReview',
      entityId: id,
      before,
    }),
  ]);
  return c.json({ ok: true });
});

// --- Coupons -----------------------------------------------------------------

admin.get('/coupons', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.CouponsView);
  return c.json(
    await ctx.db.all(
      `SELECT "id", "code", "type", "value", "description", "minOrderMinor", "maxDiscountMinor",
              "startsAt", "endsAt", "maxRedemptions", "maxRedemptionsPerCustomer", "timesRedeemed",
              "firstOrderOnly", "freeShipping", "isActive", "createdAt"
         FROM "coupons" ORDER BY "createdAt" DESC`,
    ),
  );
});

admin.post('/coupons', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CouponsManage);
  const body = parse(adminCouponSchema, await readJson(c.req.raw));

  const id = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "coupons"
         ("id", "code", "type", "value", "description", "minOrderMinor", "maxDiscountMinor",
          "maxRedemptions", "maxRedemptionsPerCustomer", "firstOrderOnly", "freeShipping",
          "endsAt", "isActive")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      body.code,
      body.type,
      body.value,
      body.description ?? null,
      body.minOrderMinor ?? null,
      body.maxDiscountMinor ?? null,
      body.maxRedemptions ?? null,
      body.maxRedemptionsPerCustomer ?? null,
      body.firstOrderOnly ? 1 : 0,
      body.freeShipping ? 1 : 0,
      body.endsAt ?? null,
      body.isActive ? 1 : 0,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'coupon.create',
      entityType: 'Coupon',
      entityId: id,
      after: body,
    }),
  ]);
  return c.json({ id, ...body }, 201);
});

/*
 * PUT and PATCH both. The coupons screen sends PUT; the route was PATCH only,
 * so editing a coupon 404'd. The body is a whole coupon either way.
 */
const updateCoupon = async (c: Context<AppEnv>) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CouponsManage);
  const id = pathId(c.req.param('id'));
  const body = parse(adminCouponSchema, await readJson(c.req.raw));

  const before = await ctx.db.first(`SELECT * FROM "coupons" WHERE "id" = ?`, id);
  if (!before) throw notFound('Coupon not found.');

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "coupons"
          SET "code" = ?, "type" = ?, "value" = ?, "description" = ?, "minOrderMinor" = ?,
              "maxDiscountMinor" = ?, "maxRedemptions" = ?, "maxRedemptionsPerCustomer" = ?,
              "firstOrderOnly" = ?, "freeShipping" = ?, "endsAt" = ?, "isActive" = ?, "updatedAt" = ?
        WHERE "id" = ?`,
      body.code,
      body.type,
      body.value,
      body.description ?? null,
      body.minOrderMinor ?? null,
      body.maxDiscountMinor ?? null,
      body.maxRedemptions ?? null,
      body.maxRedemptionsPerCustomer ?? null,
      body.firstOrderOnly ? 1 : 0,
      body.freeShipping ? 1 : 0,
      body.endsAt ?? null,
      body.isActive ? 1 : 0,
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'coupon.update',
      entityType: 'Coupon',
      entityId: id,
      before,
      after: body,
    }),
  ]);
  return c.json({ id, ...body });
};

admin.put('/coupons/:id', updateCoupon);
admin.patch('/coupons/:id', updateCoupon);

// --- Campaigns and promotions ------------------------------------------------

admin.get('/campaigns', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.CampaignsView);
  const rows = await ctx.db.all<Record<string, unknown>>(
    `SELECT c."id", c."title", c."slug", c."shortDescription", c."startsAt", c."endsAt",
            c."status", c."position", c."isVisible",
            (SELECT COUNT(*) FROM "campaign_products" cp WHERE cp."campaignId" = c."id") AS "productCount"
       FROM "campaigns" c ORDER BY c."position", c."startsAt" DESC`,
  );
  return c.json(
    rows.map((row) => ({
      ...row,
      // See the customers listing: the panel reads `campaign._count.products`.
      _count: { products: Number(row.productCount ?? 0) },
    })),
  );
});

admin.get('/promotions', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.CampaignsView);
  return c.json(
    await ctx.db.all(
      `SELECT "id", "name", "description", "type", "value", "startsAt", "endsAt", "isActive"
         FROM "promotions" ORDER BY "createdAt" DESC`,
    ),
  );
});

// --- Returns and shipments ---------------------------------------------------

/**
 * The returns queue.
 *
 * Carries each request's lines, because the list totals the units being sent
 * back (`request.items.reduce(…)`) — without them the page threw on render.
 * Two queries for the whole page rather than one per request.
 */
admin.get('/returns', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ReturnsView);
  const status = c.req.query('status');

  const requests = await ctx.db.all<Record<string, unknown>>(
    `SELECT r."id", r."rmaNumber", r."orderId", r."status", r."reason", r."customerNote",
            r."createdAt", o."orderNumber", u."email" AS "customerEmail"
       FROM "return_requests" r
       JOIN "orders" o ON o."id" = r."orderId"
       LEFT JOIN "users" u ON u."id" = r."userId"
       ${status ? 'WHERE r."status" = ?' : ''}
      ORDER BY r."createdAt" DESC LIMIT 100`,
    ...(status ? [status] : []),
  );

  const ids = requests.map((row) => row.id as string);
  const { sql: idList, bindings } = inClause(ids);
  const [lines, refunds] = await Promise.all([
    ctx.db.all<Record<string, unknown>>(
      `SELECT ri."id", ri."returnRequestId", ri."orderItemId", ri."quantity",
              ri."receivedQuantity", ri."restockedQuantity", ri."condition",
              oi."name", oi."sku"
         FROM "return_items" ri
         JOIN "order_items" oi ON oi."id" = ri."orderItemId"
        WHERE ri."returnRequestId" IN ${idList}`,
      ...bindings,
    ),
    ctx.db.all<Record<string, unknown>>(
      `SELECT "id", "returnRequestId", "amountMinor", "status", "reason", "createdAt"
         FROM "refunds" WHERE "returnRequestId" IN ${idList}`,
      ...bindings,
    ),
  ]);

  const group = <T extends Record<string, unknown>>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = row.returnRequestId as string;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };
  const linesBy = group(lines);
  const refundsBy = group(refunds);

  return c.json(
    requests.map((request) => ({
      ...request,
      items: linesBy.get(request.id as string) ?? [],
      refunds: refundsBy.get(request.id as string) ?? [],
    })),
  );
});

admin.get('/shipments', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.OrdersView);
  return c.json(
    await ctx.db.all(
      `SELECT s."id", s."carrier", s."trackingNumber", s."status", s."shippedAt", s."deliveredAt",
              o."orderNumber", o."email"
         FROM "shipments" s JOIN "orders" o ON o."id" = s."orderId"
        ORDER BY s."createdAt" DESC LIMIT 100`,
    ),
  );
});

// --- CMS ---------------------------------------------------------------------

admin.get('/content', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ContentManage);
  return c.json(await listContentPages(ctx.db));
});

/*
 * The admin panel addresses the CMS two ways: `/admin/content/pages` with the
 * key in the body, and `/admin/content/<key>` with it in the path. Both are
 * served by this one pair of handlers rather than by a literal route beside a
 * parameterised one — Hono resolves `/content/pages` to the `:key` route
 * whichever order they are registered in, so a separate literal is simply
 * unreachable. `pages` is therefore treated as "the key is in the body".
 */
const PAGES_COLLECTION = 'pages';

admin.get('/content/:key', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ContentManage);
  const key = pathSlug(c.req.param('key'), 'page key');
  if (key === PAGES_COLLECTION) return c.json(await listContentPages(ctx.db));

  const page = await ctx.db.first(
    `SELECT "key", "title", "body", "updatedAt" FROM "content_pages" WHERE "key" = ?`,
    key,
  );
  if (!page) throw notFound('Page not found.');
  return c.json(page);
});

admin.put('/content/:key', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ContentManage);
  const pathKey = pathSlug(c.req.param('key'), 'page key');
  const raw = await readJson(c.req.raw);

  const collectionSchema = adminContentSchema.extend({
    key: z.string().trim().min(1).max(64),
  });
  const body =
    pathKey === PAGES_COLLECTION
      ? parse(collectionSchema, raw)
      : { ...parse(adminContentSchema, raw), key: pathKey };
  const key = pathSlug(body.key, 'page key');

  const before = await ctx.db.first(
    `SELECT "title", "body" FROM "content_pages" WHERE "key" = ?`,
    key,
  );

  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "content_pages" ("key", "title", "body", "updatedAt") VALUES (?, ?, ?, ?)
       ON CONFLICT ("key") DO UPDATE SET "title" = excluded."title", "body" = excluded."body", "updatedAt" = excluded."updatedAt"`,
      key,
      body.title,
      body.body,
      nowIso(),
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'content.update',
      entityType: 'ContentPage',
      entityId: key,
      before,
      after: { title: body.title },
    }),
  ]);
  return c.json({ ok: true, key });
});

// --- Settings ----------------------------------------------------------------

/**
 * Settings, as the flat object the panel edits.
 *
 * `readSettings` merges the stored rows over the defaults, so a key nobody has
 * ever saved still comes back with the value the pricing code is actually
 * using — which is the number the administrator needs to see in the field. The
 * raw rows are no use to a form: it binds inputs to `reservationDurationMinutes`,
 * not to `rows.find(r => r.key === …)`.
 */
admin.get('/settings', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.SettingsUpdate);
  return c.json(await readSettings(ctx.db));
});

/**
 * Saving the whole form at once.
 *
 * The panel PUTs the settings object it was given back, so every key arrives
 * together and a partial save cannot leave shipping updated and tax not. Keys
 * the schema does not model are rejected rather than stored, otherwise a typo
 * would write a row `readSettings` silently ignores forever.
 */
admin.put('/settings', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.SettingsUpdate);
  const body = parse(adminSettingsBulkSchema, await readJson(c.req.raw));

  const entries = Object.entries(body).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw badRequest('No settings were supplied.');

  const before = await readSettings(ctx.db);
  const now = nowIso();
  await ctx.db.batch([
    ...entries.map(([key, value]) =>
      ctx.db.statement(
        `INSERT INTO "site_settings" ("key", "value", "updatedAt", "updatedByUserId") VALUES (?, ?, ?, ?)
         ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt", "updatedByUserId" = excluded."updatedByUserId"`,
        key,
        toJson(value),
        now,
        session.user.id,
      ),
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'settings.update',
      entityType: 'SiteSetting',
      entityId: entries.map(([key]) => key).join(','),
      before,
      after: body,
    }),
  ]);
  return c.json(await readSettings(ctx.db));
});

admin.put('/settings/:key', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.SettingsUpdate);
  const key = pathSlug(c.req.param('key'), 'setting key');
  const body = parse(adminSettingSchema, await readJson(c.req.raw));

  const before = await ctx.db.first(`SELECT "value" FROM "site_settings" WHERE "key" = ?`, key);

  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "site_settings" ("key", "value", "updatedAt", "updatedByUserId") VALUES (?, ?, ?, ?)
       ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt", "updatedByUserId" = excluded."updatedByUserId"`,
      key,
      toJson(body.value),
      nowIso(),
      session.user.id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'settings.update',
      entityType: 'SiteSetting',
      entityId: key,
      before,
      after: { value: body.value },
    }),
  ]);
  return c.json({ ok: true });
});

// --- Users, roles, audit -----------------------------------------------------

admin.get('/users', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.AdminUsersManage);
  const rows = await ctx.db.all<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: string;
    roleNames: string | null;
  }>(
    `SELECT u."id", u."email", u."firstName", u."lastName", u."status", u."createdAt",
            GROUP_CONCAT(r."name") AS "roleNames"
       FROM "users" u
       JOIN "user_roles" ur ON ur."userId" = u."id"
       JOIN "roles" r ON r."id" = ur."roleId"
      GROUP BY u."id" ORDER BY u."email"`,
  );
  return c.json(
    rows.map((row) => ({ ...row, roles: (row.roleNames ?? '').split(',').filter(Boolean) })),
  );
});

admin.get('/roles', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.AdminUsersManage);
  const roles = await ctx.db.all<{
    id: string;
    name: string;
    description: string | null;
    permissions: string | null;
    userCount: number;
  }>(
    `SELECT r."id", r."name", r."description",
            GROUP_CONCAT(p."key") AS "permissions",
            (SELECT COUNT(*) FROM "user_roles" ur WHERE ur."roleId" = r."id") AS "userCount"
       FROM "roles" r
       LEFT JOIN "role_permissions" rp ON rp."roleId" = r."id"
       LEFT JOIN "permissions" p ON p."id" = rp."permissionId"
      GROUP BY r."id" ORDER BY r."name"`,
  );
  return c.json(
    roles.map((role) => ({
      ...role,
      permissions: (role.permissions ?? '').split(',').filter(Boolean),
    })),
  );
});

admin.get('/audit-logs', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.AuditLogsView);
  const query = c.req.query();

  const clauses: string[] = [];
  const bindings: SqlValue[] = [];
  if (query.entityType) {
    clauses.push(`"entityType" = ?`);
    bindings.push(query.entityType);
  }
  if (query.action) {
    clauses.push(`"action" = ?`);
    bindings.push(query.action);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const pageSize = Math.max(1, Math.min(200, Number(query.pageSize) || 50));
  const total = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "audit_logs" ${where}`,
    ...bindings,
  );
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  const items = await ctx.db.all(
    `SELECT "id", "actorEmail", "actorType", "action", "entityType", "entityId", "reason", "createdAt"
       FROM "audit_logs" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );
  // `before`/`after` and the actor's IP are held but not listed: the index is
  // a timeline, and the payloads can contain customer detail.
  return c.json({ items, total, page, pageSize, totalPages });
});

// --- Media upload ------------------------------------------------------------

/**
 * Uploading an image.
 *
 * Requires `products.update`, checks the bytes rather than the headers, and
 * builds the object key itself from a generated id — the client never supplies
 * a path, so there is no traversal to defend against here.
 */
/**
 * `/admin/uploads` is what the panel posts to; `/admin/media/upload` is the
 * name this API introduced. Both reach the same handler rather than one of
 * them 404ing on a file the administrator has already chosen.
 */
admin.post('/uploads', (c) => uploadHandler(c));
admin.post('/media/upload', (c) => uploadHandler(c));

async function uploadHandler(c: Context<AppEnv>) {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'upload', session.user.id);

  const form = await c.req.formData().catch(() => null);
  const entry = form?.get('file');
  // Duck-typed rather than `instanceof File`: the Workers runtime exposes the
  // form entry as a Blob-like object and the global constructor is not a
  // reliable brand check across runtimes.
  const file =
    entry && typeof entry === 'object' && 'arrayBuffer' in entry
      ? (entry as { arrayBuffer(): Promise<ArrayBuffer>; type?: string; name?: string })
      : null;
  if (!file) throw new ApiError('BAD_REQUEST', 'Attach a file to upload.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = assertUploadable(file.type ?? '', bytes);

  const id = newId();
  const key = `uploads/${id}.${extensionFor(mime)}`;

  await ctx.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
  });

  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "uploaded_files" ("id", "bucket", "objectKey", "originalName", "mimeType", "sizeBytes", "uploadedByUserId")
       VALUES (?, 'MEDIA', ?, ?, ?, ?, ?)`,
      id,
      key,
      // The client's filename is stored for reference only; it is never used to
      // build the key, and it is length-capped.
      (file.name || 'upload').slice(0, 200),
      mime,
      bytes.byteLength,
      session.user.id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'media.upload',
      entityType: 'UploadedFile',
      entityId: id,
      after: { objectKey: key, mimeType: mime, sizeBytes: bytes.byteLength },
    }),
  ]);

  return c.json({ id, objectKey: key, url: `/media/${key}`, mimeType: mime }, 201);
}

admin.delete('/media/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const id = pathId(c.req.param('id'));

  const file = await ctx.db.first<{ objectKey: string }>(
    `SELECT "objectKey" FROM "uploaded_files" WHERE "id" = ?`,
    id,
  );
  if (!file) throw notFound('File not found.');
  // The key comes from the database row, not from the request, so a caller
  // cannot name an arbitrary object to delete.
  await ctx.env.MEDIA.delete(file.objectKey);
  await ctx.db.run(`DELETE FROM "uploaded_files" WHERE "id" = ?`, id);

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'media.delete',
    entityType: 'UploadedFile',
    entityId: id,
    before: { objectKey: file.objectKey },
  });
  return c.json({ ok: true });
});
