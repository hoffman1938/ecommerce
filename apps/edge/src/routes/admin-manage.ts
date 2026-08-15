/**
 * The rest of the administration API: the screens that write.
 *
 * Split from routes/admin.ts only for length — the rules are identical. Every
 * route starts with `requirePermission` against roles loaded from the
 * database, every mutation writes an audit row, and paths match exactly what
 * the admin panel already calls.
 */

import type { Context } from 'hono';
import { Permissions, ROLE_DEFINITIONS } from '@outlet/types';
import { z } from 'zod';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';
import { admin } from './admin';
import { ApiError, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { Db, bool, fromBool, inClause, nowIso, toJson } from '../lib/sql';
import { auditStatement, requirePermission, writeAudit } from '../auth/rbac';
import { adjustStock, release } from '../services/inventory';
import { notify } from '../services/inbox';
import { adminCampaignSchema, parse, pathId, readJson } from '../lib/validate';

/*
 * These attach to the *same* Hono instance as routes/admin.ts. The split is
 * purely a file split; one router keeps registration order well defined,
 * which matters wherever a literal path sits beside a parameterised one.
 */
const adminManage = admin;

// --- Categories --------------------------------------------------------------

const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.'),
    pathSegment: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.'),
    parentId: z.string().trim().max(64).nullish(),
    targetGroup: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']),
    sizeChartGroup: z.enum(['tops', 'shirts', 'bottoms']).nullish(),
    description: z.string().trim().max(500).nullish(),
    position: z.number().int().min(0).max(9999).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

adminManage.post('/categories', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsCreate);
  const body = parse(categorySchema, await readJson(c.req.raw));

  const id = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "categories"
         ("id", "name", "slug", "pathSegment", "parentId", "targetGroup", "sizeChartGroup",
          "description", "position", "isActive")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      body.name,
      body.slug,
      body.pathSegment,
      body.parentId ?? null,
      body.targetGroup,
      body.sizeChartGroup ?? null,
      body.description ?? null,
      body.position,
      bool(body.isActive),
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'category.create',
      entityType: 'Category',
      entityId: id,
      after: body,
    }),
  ]);
  return c.json({ id, ...body }, 201);
});

adminManage.put('/categories/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const id = pathId(c.req.param('id'));

  // `reorder` is a collection operation, not an id. Hono resolves
  // /categories/reorder to this parameterised route whichever order a literal
  // one is registered in, so it is dispatched from here rather than declared
  // beside it and left unreachable.
  if (id === 'reorder') return reorderCategories(c);

  const body = parse(categorySchema, await readJson(c.req.raw));

  const before = await ctx.db.first(`SELECT * FROM "categories" WHERE "id" = ?`, id);
  if (!before) throw notFound('Category not found.');
  // A category that is its own parent would make the tree walk non-terminating.
  if (body.parentId === id)
    throw new ApiError('BAD_REQUEST', 'A category cannot be its own parent.');

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "categories"
          SET "name" = ?, "slug" = ?, "pathSegment" = ?, "parentId" = ?, "targetGroup" = ?,
              "sizeChartGroup" = ?, "description" = ?, "position" = ?, "isActive" = ?, "updatedAt" = ?
        WHERE "id" = ?`,
      body.name,
      body.slug,
      body.pathSegment,
      body.parentId ?? null,
      body.targetGroup,
      body.sizeChartGroup ?? null,
      body.description ?? null,
      body.position,
      bool(body.isActive),
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
      before,
      after: body,
    }),
  ]);
  return c.json({ id, ...body });
});

adminManage.patch('/categories/:id/visibility', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const id = pathId(c.req.param('id'));
  const body = parse(z.object({ isActive: z.boolean() }).strict(), await readJson(c.req.raw));

  const result = await ctx.db.run(
    `UPDATE "categories" SET "isActive" = ?, "updatedAt" = ? WHERE "id" = ?`,
    bool(body.isActive),
    nowIso(),
    id,
  );
  if (Db.changes(result) === 0) throw notFound('Category not found.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'category.visibility',
    entityType: 'Category',
    entityId: id,
    after: { isActive: body.isActive },
  });
  return c.json({ ok: true, isActive: body.isActive });
});

/** Rewrites sibling positions from a submitted order. Reached via `:id`. */
async function reorderCategories(c: Context<AppEnv>) {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const body = parse(
    z
      .object({
        parentId: z.string().trim().max(64).nullish(),
        orderedIds: z.array(z.string().trim().max(64)).max(200),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  // Positions are rewritten from the submitted order, and the parent is part
  // of the WHERE so a caller cannot reposition somebody else's branch.
  const statements = body.orderedIds.map((id, index) =>
    ctx.db.statement(
      `UPDATE "categories" SET "position" = ?, "updatedAt" = ?
        WHERE "id" = ? AND "parentId" IS ?`,
      index,
      nowIso(),
      id,
      body.parentId ?? null,
    ),
  );
  statements.push(
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'category.reorder',
      entityType: 'Category',
      entityId: body.parentId ?? null,
      after: { orderedIds: body.orderedIds },
    }),
  );
  await ctx.db.batch(statements);
  return c.json({ ok: true });
}

/**
 * Deleting a category.
 *
 * Refused while anything still points at it. A cascade here would either
 * orphan products or silently delete a whole branch of the tree, and neither
 * is what an administrator pressing "delete" is asking for — so the endpoint
 * reports what is in the way instead.
 */
adminManage.post('/categories/:id/delete', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsArchive);
  const id = pathId(c.req.param('id'));

  const category = await ctx.db.first<{ name: string }>(
    `SELECT "name" FROM "categories" WHERE "id" = ?`,
    id,
  );
  if (!category) throw notFound('Category not found.');

  const [children, products] = await Promise.all([
    ctx.db.count(`SELECT COUNT(*) AS "c" FROM "categories" WHERE "parentId" = ?`, id),
    ctx.db.count(`SELECT COUNT(*) AS "c" FROM "products" WHERE "categoryId" = ?`, id),
  ]);
  if (children > 0 || products > 0) {
    throw new ApiError('CONFLICT', 'This category still has things in it.', {
      childCategories: children,
      products,
    });
  }

  await ctx.db.batch([
    ctx.db.statement(`DELETE FROM "categories" WHERE "id" = ?`, id),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'category.delete',
      entityType: 'Category',
      entityId: id,
      before: category,
    }),
  ]);
  return c.json({ ok: true });
});

// --- Variants and images -----------------------------------------------------

adminManage.post('/products/:id/variants', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const productId = pathId(c.req.param('id'));
  const body = parse(
    z
      .object({
        sku: z.string().trim().min(1).max(64),
        size: z.string().trim().max(32).nullish(),
        color: z.string().trim().max(48).nullish(),
        barcode: z.string().trim().max(64).nullish(),
        priceOverrideMinor: z.number().int().min(0).nullish(),
        initialQuantity: z.number().int().min(0).max(1_000_000).default(0),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const product = await ctx.db.first<{ id: string }>(
    `SELECT "id" FROM "products" WHERE "id" = ?`,
    productId,
  );
  if (!product) throw notFound('Product not found.');

  const position = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "product_variants" WHERE "productId" = ?`,
    productId,
  );
  const variantId = newId();
  const now = nowIso();

  // The variant, its balance and its opening ledger entry commit together —
  // a variant with no inventory row would be invisible to every stock query.
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "product_variants"
         ("id", "productId", "sku", "size", "color", "barcode", "priceOverrideMinor", "position")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      variantId,
      productId,
      body.sku,
      body.size ?? null,
      body.color ?? null,
      body.barcode ?? null,
      body.priceOverrideMinor ?? null,
      position,
    ),
    ctx.db.statement(
      `INSERT INTO "inventory_balances" ("id", "variantId", "onHandQuantity") VALUES (?, ?, ?)`,
      newId(),
      variantId,
      body.initialQuantity,
    ),
    ctx.db.statement(
      `INSERT INTO "inventory_movements"
         ("id", "variantId", "type", "quantityChange", "previousOnHand", "newOnHand", "reason", "actorUserId", "createdAt")
       VALUES (?, ?, 'INITIAL', ?, 0, ?, 'Variant created', ?, ?)`,
      newId(),
      variantId,
      body.initialQuantity,
      body.initialQuantity,
      session.user.id,
      now,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'variant.create',
      entityType: 'ProductVariant',
      entityId: variantId,
      after: body,
    }),
  ]);

  return c.json({ id: variantId, ...body }, 201);
});

adminManage.patch('/variants/:id/enabled', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const id = pathId(c.req.param('id'));
  const body = parse(z.object({ isEnabled: z.boolean() }).strict(), await readJson(c.req.raw));

  const result = await ctx.db.run(
    `UPDATE "product_variants" SET "isEnabled" = ?, "updatedAt" = ? WHERE "id" = ?`,
    bool(body.isEnabled),
    nowIso(),
    id,
  );
  if (Db.changes(result) === 0) throw notFound('Variant not found.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'variant.enabled',
    entityType: 'ProductVariant',
    entityId: id,
    after: { isEnabled: body.isEnabled },
  });
  return c.json({ ok: true, isEnabled: body.isEnabled });
});

adminManage.post('/products/:id/images', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const productId = pathId(c.req.param('id'));
  const body = parse(
    z
      .object({
        url: z.string().trim().min(1).max(500),
        objectKey: z.string().trim().max(300).nullish(),
        altText: z.string().trim().max(300).nullish(),
        variantId: z.string().trim().max(64).nullish(),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  // Only a path this API serves, never an arbitrary remote URL: an <img> whose
  // src an administrator can set to any origin is a tracking pixel waiting to
  // happen, and on a page with a strict CSP it would simply not load.
  if (!body.url.startsWith('/media/')) {
    throw new ApiError(
      'BAD_REQUEST',
      'Images must be uploaded first; the URL has to be a /media/ path.',
    );
  }

  const position = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "product_images" WHERE "productId" = ?`,
    productId,
  );
  const id = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "product_images" ("id", "productId", "variantId", "url", "objectKey", "altText", "position")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      productId,
      body.variantId ?? null,
      body.url,
      body.objectKey ?? null,
      body.altText ?? null,
      position,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'product.image_add',
      entityType: 'ProductImage',
      entityId: id,
      after: body,
    }),
  ]);
  return c.json({ id, ...body, position }, 201);
});

adminManage.delete('/products/:id/images/:imageId', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsUpdate);
  const productId = pathId(c.req.param('id'));
  const imageId = pathId(c.req.param('imageId'), 'image id');

  // Scoped by product as well as by image id, so an image cannot be deleted
  // from a product the caller was not looking at.
  const result = await ctx.db.run(
    `DELETE FROM "product_images" WHERE "id" = ? AND "productId" = ?`,
    imageId,
    productId,
  );
  if (Db.changes(result) === 0) throw notFound('Image not found.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'product.image_remove',
    entityType: 'ProductImage',
    entityId: imageId,
  });
  return c.json({ ok: true });
});

// --- Inventory ---------------------------------------------------------------

/**
 * Stock adjustment, as the inventory screen sends it: a delta and a movement
 * type rather than an absolute figure.
 */
adminManage.post('/inventory/adjust', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.InventoryAdjust);
  const body = parse(
    z
      .object({
        variantId: z.string().trim().min(1).max(64),
        type: z.enum([
          'RESTOCK',
          'ADJUSTMENT_INCREASE',
          'ADJUSTMENT_DECREASE',
          'CORRECTION',
          'DAMAGED',
        ]),
        quantity: z.number().int().min(1).max(1_000_000),
        reason: z.string().trim().min(1).max(200),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const balance = await ctx.db.first<{ onHandQuantity: number }>(
    `SELECT "onHandQuantity" FROM "inventory_balances" WHERE "variantId" = ?`,
    body.variantId,
  );
  if (!balance) throw notFound('That variant has no inventory record.');

  const increases = body.type === 'RESTOCK' || body.type === 'ADJUSTMENT_INCREASE';
  const target = increases
    ? balance.onHandQuantity + body.quantity
    : balance.onHandQuantity - body.quantity;

  const result = await adjustStock(ctx.db, {
    variantId: body.variantId,
    newOnHand: Math.max(0, target),
    reason: body.reason,
    actorUserId: session.user.id,
    type: body.type,
  });

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'inventory.adjust',
    entityType: 'InventoryBalance',
    entityId: body.variantId,
    before: { onHandQuantity: result.previousOnHand },
    after: { onHandQuantity: result.newOnHand },
    reason: body.reason,
  });
  return c.json(result);
});

adminManage.get('/inventory/movements', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.InventoryView);
  const variantId = c.req.query('variantId');

  const rows = variantId
    ? await ctx.db.all(
        MOVEMENT_SELECT + ` WHERE m."variantId" = ? ORDER BY m."createdAt" DESC LIMIT 100`,
        variantId,
      )
    : await ctx.db.all(MOVEMENT_SELECT + ` ORDER BY m."createdAt" DESC LIMIT 100`);
  return c.json(rows);
});

const MOVEMENT_SELECT = `
  SELECT m."id", m."variantId", v."sku", p."name" AS "productName", m."type",
         m."quantityChange", m."previousOnHand", m."newOnHand", m."reason",
         u."email" AS "actorEmail", m."createdAt"
    FROM "inventory_movements" m
    JOIN "product_variants" v ON v."id" = m."variantId"
    JOIN "products" p ON p."id" = v."productId"
    LEFT JOIN "users" u ON u."id" = m."actorUserId"`;

adminManage.post('/inventory/reservations/:id/cancel', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReservationsCancel);
  const id = pathId(c.req.param('id'), 'reservation id');

  // release() is the same path expiry uses, so the stock accounting is
  // identical whether a hold lapses or an administrator ends it.
  await release(ctx.db, id, 'Cancelled by an administrator');
  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'reservation.cancel',
    entityType: 'InventoryReservation',
    entityId: id,
  });
  return c.json({ ok: true });
});

// --- Orders ------------------------------------------------------------------

adminManage.post('/orders/:id/notes', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.OrdersUpdate);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z.object({ note: z.string().trim().min(1).max(2000) }).strict(),
    await readJson(c.req.raw),
  );

  const result = await ctx.db.run(
    `UPDATE "orders" SET "internalNote" = ?, "updatedAt" = ? WHERE "id" = ?`,
    body.note,
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

// --- Reviews -----------------------------------------------------------------

/** Recomputes a product's denormalised rating from its published rows. */
const recomputeRating = (db: Db, productId: string) =>
  db.statement(
    `UPDATE "products"
        SET "ratingSum" = (SELECT COALESCE(SUM("rating"), 0) FROM "product_reviews"
                            WHERE "productId" = ? AND "status" = 'PUBLISHED'),
            "reviewCount" = (SELECT COUNT(*) FROM "product_reviews"
                              WHERE "productId" = ? AND "status" = 'PUBLISHED'),
            "updatedAt" = ?
      WHERE "id" = ?`,
    productId,
    productId,
    nowIso(),
    productId,
  );

adminManage.post('/reviews/:id/status', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReviewsModerate);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z
      .object({
        status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN']),
        note: z.string().trim().max(500).nullish(),
      })
      .strict(),
    await readJson(c.req.raw),
  );

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
      body.note ?? null,
      now,
      session.user.id,
      now,
      id,
    ),
    recomputeRating(ctx.db, review.productId),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'review.moderate',
      entityType: 'ProductReview',
      entityId: id,
      before: { status: review.status },
      after: { status: body.status },
      reason: body.note ?? null,
    }),
  ]);
  return c.json({ id, status: body.status });
});

adminManage.post('/reviews/bulk', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReviewsModerate);
  const body = parse(
    z
      .object({
        ids: z.array(z.string().trim().max(64)).min(1).max(100),
        action: z.enum(['publish', 'reject', 'hide', 'pending']),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const STATUS = {
    publish: 'PUBLISHED',
    reject: 'REJECTED',
    hide: 'HIDDEN',
    pending: 'PENDING',
  } as const;
  const status = STATUS[body.action];

  const placeholders = body.ids.map(() => '?').join(', ');
  const affected = await ctx.db.all<{ productId: string }>(
    `SELECT DISTINCT "productId" FROM "product_reviews" WHERE "id" IN (${placeholders})`,
    ...body.ids,
  );

  const now = nowIso();
  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "product_reviews"
          SET "status" = ?, "moderatedAt" = ?, "moderatedByUserId" = ?, "updatedAt" = ?
        WHERE "id" IN (${placeholders})`,
      status,
      now,
      session.user.id,
      now,
      ...body.ids,
    ),
    // Every product touched has its aggregate recomputed, not just the first.
    ...affected.map((row) => recomputeRating(ctx.db, row.productId)),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'review.bulk_moderate',
      entityType: 'ProductReview',
      after: { ids: body.ids, status },
    }),
  ]);

  return c.json({ count: body.ids.length, ids: body.ids });
});

/**
 * The moderation dashboard's header.
 *
 * `statusCounts` and `distribution` are maps, not columns: the queue's tab
 * counts index `statusCounts[tab.key]` and the histogram indexes
 * `distribution['5']`. Returning the flat SUM row instead threw on
 * `Object.values(undefined)` and blanked the reviews screen.
 */
adminManage.get('/reviews/stats', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ReviewsView);

  const [byStatus, byRating, row] = await Promise.all([
    ctx.db.all<{ status: string; c: number }>(
      `SELECT "status", COUNT(*) AS "c" FROM "product_reviews" GROUP BY "status"`,
    ),
    ctx.db.all<{ rating: number; c: number }>(
      `SELECT "rating", COUNT(*) AS "c" FROM "product_reviews"
        WHERE "status" = 'PUBLISHED' GROUP BY "rating"`,
    ),
    ctx.db.first<{ reported: number; unanswered: number; ratingAverage: number | null }>(
      `SELECT SUM(CASE WHEN "reportCount" > 0 THEN 1 ELSE 0 END) AS "reported",
              SUM(CASE WHEN "adminReply" IS NULL AND "status" = 'PUBLISHED' THEN 1 ELSE 0 END)
                AS "unanswered",
              ROUND(AVG(CASE WHEN "status" = 'PUBLISHED' THEN "rating" END), 2) AS "ratingAverage"
         FROM "product_reviews"`,
    ),
  ]);

  // Every status present, so a tab with no reviews shows 0 rather than blank.
  const statusCounts: Record<string, number> = {
    PENDING: 0,
    PUBLISHED: 0,
    REJECTED: 0,
    HIDDEN: 0,
  };
  for (const { status, c: count } of byStatus) statusCounts[status] = count;

  const distribution: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { rating, c: count } of byRating) distribution[String(rating)] = count;

  return c.json({
    statusCounts,
    distribution,
    reported: row?.reported ?? 0,
    unanswered: row?.unanswered ?? 0,
    publishedCount: statusCounts.PUBLISHED,
    ratingAverage: row?.ratingAverage ?? null,
    total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
  });
});

// --- Customers ---------------------------------------------------------------

adminManage.post('/customers/:id/disable', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CustomersDisable);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z.object({ reason: z.string().trim().max(300).nullish() }).strict(),
    await readJson(c.req.raw),
  );

  // Disabling yourself would lock the panel with nobody able to undo it.
  if (id === session.user.id) {
    throw new ApiError('BAD_REQUEST', 'You cannot disable your own account.');
  }

  const result = await ctx.db.run(
    `UPDATE "users" SET "status" = 'DISABLED', "disabledReason" = ?, "updatedAt" = ? WHERE "id" = ?`,
    body.reason ?? null,
    nowIso(),
    id,
  );
  if (Db.changes(result) === 0) throw notFound('Customer not found.');

  // Their live sessions end now, not when they next expire.
  await ctx.db.run(
    `UPDATE "user_sessions" SET "revokedAt" = ? WHERE "userId" = ? AND "revokedAt" IS NULL`,
    nowIso(),
    id,
  );

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'customer.disable',
    entityType: 'User',
    entityId: id,
    after: { status: 'DISABLED' },
    reason: body.reason ?? null,
  });
  return c.json({ ok: true, status: 'DISABLED' });
});

adminManage.post('/customers/:id/enable', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CustomersDisable);
  const id = pathId(c.req.param('id'));

  const result = await ctx.db.run(
    `UPDATE "users" SET "status" = 'ACTIVE', "disabledReason" = NULL, "failedLoginAttempts" = 0,
            "lockedUntil" = NULL, "updatedAt" = ? WHERE "id" = ?`,
    nowIso(),
    id,
  );
  if (Db.changes(result) === 0) throw notFound('Customer not found.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'customer.enable',
    entityType: 'User',
    entityId: id,
    after: { status: 'ACTIVE' },
  });
  return c.json({ ok: true, status: 'ACTIVE' });
});

// --- Roles -------------------------------------------------------------------

adminManage.post('/users/:id/roles', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.AdminUsersManage);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z.object({ roleNames: z.array(z.string().trim().max(60)).max(20) }).strict(),
    await readJson(c.req.raw),
  );

  // Removing your own last role is how an administrator locks themselves out
  // of the panel with no way back in.
  if (id === session.user.id && body.roleNames.length === 0) {
    throw new ApiError('BAD_REQUEST', 'You cannot remove your own last role.');
  }

  const known = new Set(Object.keys(ROLE_DEFINITIONS));
  const unknown = body.roleNames.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new ApiError('VALIDATION_FAILED', `Unknown role: ${unknown.join(', ')}`);
  }

  const roles = body.roleNames.length
    ? await ctx.db.all<{ id: string; name: string }>(
        `SELECT "id", "name" FROM "roles" WHERE "name" IN (${body.roleNames.map(() => '?').join(', ')})`,
        ...body.roleNames,
      )
    : [];

  const before = await ctx.db.all<{ name: string }>(
    `SELECT r."name" FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = ?`,
    id,
  );

  await ctx.db.batch([
    ctx.db.statement(`DELETE FROM "user_roles" WHERE "userId" = ?`, id),
    ...roles.map((role) =>
      ctx.db.statement(`INSERT INTO "user_roles" ("userId", "roleId") VALUES (?, ?)`, id, role.id),
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'user.role_change',
      entityType: 'User',
      entityId: id,
      before: { roles: before.map((r) => r.name) },
      after: { roles: roles.map((r) => r.name) },
    }),
  ]);

  return c.json({ ok: true, roles: roles.map((role) => role.name) });
});

// --- Campaigns ---------------------------------------------------------------

/**
 * The slug is what `/campaigns/:slug` on the storefront resolves, so a second
 * campaign claiming one would make the first unreachable. The column has no
 * UNIQUE index (a slug freed by an archived campaign should be reusable), so
 * the check is here, and it excludes the row being edited — otherwise saving a
 * campaign without touching its slug would report a conflict with itself.
 */
async function assertSlugFree(
  db: ReturnType<typeof ctxOf>['db'],
  slug: string,
  exceptId?: string,
): Promise<void> {
  const clash = await db.first<{ id: string }>(
    `SELECT "id" FROM "campaigns" WHERE "slug" = ? AND "id" <> ? LIMIT 1`,
    slug,
    exceptId ?? '',
  );
  if (clash) throw conflict('Another campaign already uses that slug.');
}

adminManage.post('/campaigns', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CampaignsManage);
  const body = parse(adminCampaignSchema, await readJson(c.req.raw));
  await assertSlugFree(ctx.db, body.slug);

  const id = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "campaigns"
         ("id", "title", "slug", "shortDescription", "description", "coverImageUrl",
          "startsAt", "endsAt", "status", "position", "isVisible", "seoTitle", "seoDescription")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      body.title,
      body.slug,
      body.shortDescription ?? null,
      body.description ?? null,
      body.coverImageUrl ?? null,
      body.startsAt,
      body.endsAt,
      body.status,
      body.position,
      bool(body.isVisible),
      body.seoTitle ?? null,
      body.seoDescription ?? null,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'campaign.create',
      entityType: 'Campaign',
      entityId: id,
      after: body,
    }),
  ]);
  return c.json({ id, ...body }, 201);
});

adminManage.put('/campaigns/:id', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CampaignsManage);
  const id = pathId(c.req.param('id'));
  const body = parse(adminCampaignSchema, await readJson(c.req.raw));

  const before = await ctx.db.first(`SELECT * FROM "campaigns" WHERE "id" = ?`, id);
  if (!before) throw notFound('Campaign not found.');
  await assertSlugFree(ctx.db, body.slug, id);

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "campaigns"
          SET "title" = ?, "slug" = ?, "shortDescription" = ?, "description" = ?,
              "coverImageUrl" = ?, "startsAt" = ?, "endsAt" = ?, "status" = ?, "position" = ?,
              "isVisible" = ?, "seoTitle" = ?, "seoDescription" = ?,
              "archivedAt" = CASE WHEN ? = 'ARCHIVED' THEN COALESCE("archivedAt", ?) ELSE NULL END,
              "updatedAt" = ?
        WHERE "id" = ?`,
      body.title,
      body.slug,
      body.shortDescription ?? null,
      body.description ?? null,
      body.coverImageUrl ?? null,
      body.startsAt,
      body.endsAt,
      body.status,
      body.position,
      bool(body.isVisible),
      body.seoTitle ?? null,
      body.seoDescription ?? null,
      body.status,
      nowIso(),
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'campaign.update',
      entityType: 'Campaign',
      entityId: id,
      before,
      after: body,
    }),
  ]);
  return c.json({ id, ...body });
});

adminManage.get('/campaigns/:id', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.CampaignsView);
  const id = pathId(c.req.param('id'));

  const campaign = await ctx.db.first(`SELECT * FROM "campaigns" WHERE "id" = ?`, id);
  if (!campaign) throw notFound('Campaign not found.');

  const products = await ctx.db.all(
    `SELECT cp."id", cp."productId", cp."campaignPriceMinor", cp."maxQuantityPerOrder",
            cp."quantityLimit", cp."soldQuantity", cp."position",
            p."name" AS "productName", p."slug" AS "productSlug", p."outletPriceMinor"
       FROM "campaign_products" cp
       JOIN "products" p ON p."id" = cp."productId"
      WHERE cp."campaignId" = ? ORDER BY cp."position"`,
    id,
  );
  return c.json({ ...campaign, products });
});

adminManage.post('/campaigns/:id/status', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CampaignsPublish);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z.object({ action: z.enum(['publish', 'pause', 'end', 'archive', 'draft']) }).strict(),
    await readJson(c.req.raw),
  );

  const STATUS = {
    publish: 'ACTIVE',
    pause: 'PAUSED',
    end: 'ENDED',
    archive: 'ARCHIVED',
    draft: 'DRAFT',
  } as const;
  const status = STATUS[body.action];

  const before = await ctx.db.first<{ status: string }>(
    `SELECT "status" FROM "campaigns" WHERE "id" = ?`,
    id,
  );
  if (!before) throw notFound('Campaign not found.');

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "campaigns" SET "status" = ?, "archivedAt" = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE "archivedAt" END, "updatedAt" = ? WHERE "id" = ?`,
      status,
      status,
      nowIso(),
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'campaign.status',
      entityType: 'Campaign',
      entityId: id,
      before,
      after: { status },
    }),
  ]);
  return c.json({ ok: true, status });
});

adminManage.post('/campaigns/:id/products', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CampaignsManage);
  const campaignId = pathId(c.req.param('id'));
  const body = parse(
    z
      .object({
        productId: z.string().trim().min(1).max(64),
        campaignPriceMinor: z.number().int().min(0).nullish(),
        maxQuantityPerOrder: z.number().int().min(1).max(100).nullish(),
        quantityLimit: z.number().int().min(0).nullish(),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const position = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "campaign_products" WHERE "campaignId" = ?`,
    campaignId,
  );
  const id = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "campaign_products"
         ("id", "campaignId", "productId", "campaignPriceMinor", "maxQuantityPerOrder", "quantityLimit", "position")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      campaignId,
      body.productId,
      body.campaignPriceMinor ?? null,
      body.maxQuantityPerOrder ?? null,
      body.quantityLimit ?? null,
      position,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'campaign.product_add',
      entityType: 'Campaign',
      entityId: campaignId,
      after: body,
    }),
  ]);
  return c.json({ id, ...body }, 201);
});

adminManage.delete('/campaigns/:id/products/:productId', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.CampaignsManage);
  const campaignId = pathId(c.req.param('id'));
  const productId = pathId(c.req.param('productId'), 'product id');

  const result = await ctx.db.run(
    `DELETE FROM "campaign_products" WHERE "campaignId" = ? AND "productId" = ?`,
    campaignId,
    productId,
  );
  if (Db.changes(result) === 0) throw notFound('That product is not in this campaign.');

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'campaign.product_remove',
    entityType: 'Campaign',
    entityId: campaignId,
    before: { productId },
  });
  return c.json({ ok: true });
});

// --- Returns -----------------------------------------------------------------

adminManage.get('/returns/:id', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ReturnsView);
  const id = pathId(c.req.param('id'));

  const request = await ctx.db.first(
    `SELECT r.*, o."orderNumber", o."totalMinor" AS "orderTotalMinor", u."email" AS "customerEmail"
       FROM "return_requests" r
       JOIN "orders" o ON o."id" = r."orderId"
       LEFT JOIN "users" u ON u."id" = r."userId"
      WHERE r."id" = ?`,
    id,
  );
  if (!request) throw notFound('Return not found.');

  const items = await ctx.db.all(
    `SELECT ri."id", ri."orderItemId", ri."quantity", ri."receivedQuantity", ri."restockedQuantity",
            ri."condition", ri."reason", oi."name", oi."sku", oi."unitPriceMinor"
       FROM "return_items" ri
       JOIN "order_items" oi ON oi."id" = ri."orderItemId"
      WHERE ri."returnRequestId" = ?`,
    id,
  );
  return c.json({ ...request, items });
});

adminManage.post('/returns/:id/decision', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReturnsManage);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z
      .object({
        decision: z.enum(['APPROVED', 'REJECTED']),
        internalNote: z.string().trim().max(1000).nullish(),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const request = await ctx.db.first<{ status: string }>(
    `SELECT "status" FROM "return_requests" WHERE "id" = ?`,
    id,
  );
  if (!request) throw notFound('Return not found.');
  if (request.status !== 'REQUESTED') {
    throw new ApiError('CONFLICT', 'This return has already been decided.');
  }

  await ctx.db.batch([
    ctx.db.statement(
      `UPDATE "return_requests" SET "status" = ?, "internalNote" = ?, "updatedAt" = ? WHERE "id" = ?`,
      body.decision,
      body.internalNote ?? null,
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'return.decision',
      entityType: 'ReturnRequest',
      entityId: id,
      before: { status: request.status },
      after: { status: body.decision },
      reason: body.internalNote ?? null,
    }),
  ]);
  return c.json({ ok: true, status: body.decision });
});

adminManage.post('/returns/:id/receive', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ReturnsManage);
  const id = pathId(c.req.param('id'));
  const body = parse(
    z
      .object({
        items: z
          .array(
            z.object({
              returnItemId: z.string().trim().max(64),
              receivedQuantity: z.number().int().min(0).max(1000),
              condition: z.enum(['UNINSPECTED', 'RESELLABLE', 'DAMAGED']),
            }),
          )
          .min(1)
          .max(100),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const request = await ctx.db.first<{ status: string }>(
    `SELECT "status" FROM "return_requests" WHERE "id" = ?`,
    id,
  );
  if (!request) throw notFound('Return not found.');
  if (request.status !== 'APPROVED') {
    throw new ApiError('CONFLICT', 'Only an approved return can be received.');
  }

  const statements = [];
  for (const item of body.items) {
    statements.push(
      ctx.db.statement(
        `UPDATE "return_items" SET "receivedQuantity" = ?, "condition" = ? WHERE "id" = ? AND "returnRequestId" = ?`,
        item.receivedQuantity,
        item.condition,
        item.returnItemId,
        id,
      ),
    );

    /*
     * Only resellable units go back on the shelf. A damaged return is stock
     * that exists and cannot be sold, which is what damagedQuantity is for —
     * restocking it would oversell the next customer.
     */
    if (item.condition === 'RESELLABLE' && item.receivedQuantity > 0) {
      statements.push(
        ctx.db.statement(
          `UPDATE "inventory_balances"
              SET "onHandQuantity" = "onHandQuantity" + ?,
                  "returnedQuantity" = "returnedQuantity" + ?,
                  "version" = "version" + 1,
                  "updatedAt" = ?
            WHERE "variantId" = (SELECT oi."variantId" FROM "return_items" ri
                                   JOIN "order_items" oi ON oi."id" = ri."orderItemId"
                                  WHERE ri."id" = ?)`,
          item.receivedQuantity,
          item.receivedQuantity,
          nowIso(),
          item.returnItemId,
        ),
        ctx.db.statement(
          `UPDATE "return_items" SET "restockedQuantity" = ? WHERE "id" = ?`,
          item.receivedQuantity,
          item.returnItemId,
        ),
      );
    } else if (item.condition === 'DAMAGED' && item.receivedQuantity > 0) {
      statements.push(
        ctx.db.statement(
          `UPDATE "inventory_balances"
              SET "damagedQuantity" = "damagedQuantity" + ?, "updatedAt" = ?
            WHERE "variantId" = (SELECT oi."variantId" FROM "return_items" ri
                                   JOIN "order_items" oi ON oi."id" = ri."orderItemId"
                                  WHERE ri."id" = ?)`,
          item.receivedQuantity,
          nowIso(),
          item.returnItemId,
        ),
      );
    }
  }

  statements.push(
    ctx.db.statement(
      `UPDATE "return_requests" SET "status" = 'RECEIVED', "updatedAt" = ? WHERE "id" = ?`,
      nowIso(),
      id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'return.receive',
      entityType: 'ReturnRequest',
      entityId: id,
      after: { items: body.items },
    }),
  );

  await ctx.db.batch(statements);
  return c.json({ ok: true, status: 'RECEIVED' });
});

/**
 * Completing a return: the refund.
 *
 * No money moves — the refund row records what a real provider would have
 * done, exactly as the demo payment does on the way in.
 */
adminManage.post('/returns/:id/complete', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.RefundsCreate);
  const id = pathId(c.req.param('id'));

  const request = await ctx.db.first<{ status: string; orderId: string }>(
    `SELECT "status", "orderId" FROM "return_requests" WHERE "id" = ?`,
    id,
  );
  if (!request) throw notFound('Return not found.');
  if (request.status !== 'RECEIVED') {
    throw new ApiError('CONFLICT', 'A return has to be received before it can be completed.');
  }

  const payment = await ctx.db.first<{
    id: string;
    amountMinor: number;
    refundedAmountMinor: number;
  }>(
    `SELECT "id", "amountMinor", "refundedAmountMinor" FROM "payments" WHERE "orderId" = ? ORDER BY "createdAt" LIMIT 1`,
    request.orderId,
  );
  if (!payment) throw new ApiError('CONFLICT', 'That order has no payment to refund against.');

  const refundable = await ctx.db.first<{ amount: number }>(
    `SELECT COALESCE(SUM(oi."unitPriceMinor" * ri."receivedQuantity"), 0) AS "amount"
       FROM "return_items" ri
       JOIN "order_items" oi ON oi."id" = ri."orderItemId"
      WHERE ri."returnRequestId" = ?`,
    id,
  );
  // Never more than is left on the payment, whatever the line maths says.
  const amount = Math.min(
    refundable?.amount ?? 0,
    payment.amountMinor - payment.refundedAmountMinor,
  );
  if (amount <= 0) throw new ApiError('CONFLICT', 'There is nothing left to refund.');

  const now = nowIso();
  const refundId = newId();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "refunds" ("id", "orderId", "paymentId", "returnRequestId", "amountMinor",
                              "status", "providerRefundId", "reason", "createdByUserId")
       VALUES (?, ?, ?, ?, ?, 'SUCCEEDED', ?, 'Return completed', ?)`,
      refundId,
      request.orderId,
      payment.id,
      id,
      amount,
      `SIM-REF-${refundId.slice(-8).toUpperCase()}`,
      session.user.id,
    ),
    ctx.db.statement(
      `UPDATE "payments"
          SET "refundedAmountMinor" = "refundedAmountMinor" + ?,
              "status" = CASE WHEN "refundedAmountMinor" + ? >= "amountMinor" THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
              "updatedAt" = ?
        WHERE "id" = ?`,
      amount,
      amount,
      now,
      payment.id,
    ),
    ctx.db.statement(
      `UPDATE "return_requests" SET "status" = 'COMPLETED', "updatedAt" = ? WHERE "id" = ?`,
      now,
      id,
    ),
    ctx.db.statement(
      `UPDATE "orders" SET "status" = 'RETURNED', "updatedAt" = ? WHERE "id" = ?`,
      now,
      request.orderId,
    ),
    ctx.db.statement(
      `INSERT INTO "order_status_history" ("id", "orderId", "fromStatus", "toStatus", "note", "actorUserId", "createdAt")
       VALUES (?, ?, 'RETURN_REQUESTED', 'RETURNED', 'Return completed — demo refund, no money moved', ?, ?)`,
      newId(),
      request.orderId,
      session.user.id,
      now,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'refund.create',
      entityType: 'Refund',
      entityId: refundId,
      after: { amountMinor: amount, demo: true },
    }),
  ]);

  return c.json({ ok: true, refundId, amountMinor: amount, demo: true });
});

// --- Products: duplicate and CSV import --------------------------------------

/**
 * Duplicating a product.
 *
 * Copies the record and its variants as a DRAFT with a suffixed slug and SKUs,
 * because a duplicate that went straight onto the storefront under a colliding
 * slug is not what "duplicate" means. Stock starts at zero: the copy is a
 * template, not inventory that exists.
 */
adminManage.post('/products/:id/duplicate', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.ProductsCreate);
  const id = pathId(c.req.param('id'));

  const source = await ctx.db.first<Record<string, string | number | null>>(
    `SELECT * FROM "products" WHERE "id" = ?`,
    id,
  );
  if (!source) throw notFound('Product not found.');

  const variants = await ctx.db.all<{
    sku: string;
    size: string | null;
    color: string | null;
    position: number;
  }>(
    `SELECT "sku", "size", "color", "position" FROM "product_variants" WHERE "productId" = ? ORDER BY "position"`,
    id,
  );

  // A suffix that is already taken would fail the unique index, so it counts up
  // until it finds one that is free rather than guessing once.
  let suffix = 2;
  let slug = `${source.slug}-copy`;
  while (await ctx.db.first(`SELECT 1 FROM "products" WHERE "slug" = ?`, slug)) {
    slug = `${source.slug}-copy-${suffix}`;
    suffix += 1;
  }

  const newProductId = newId();
  const statements = [
    ctx.db.statement(
      `INSERT INTO "products"
         ("id", "name", "slug", "brandId", "categoryId", "shortDescription", "description",
          "targetGroup", "materials", "careInstructions", "countryOfOrigin",
          "originalPriceMinor", "outletPriceMinor", "currencyCode", "taxClass", "status",
          "seoTitle", "seoDescription", "searchKeywords")
       SELECT ?, "name" || ' (copy)', ?, "brandId", "categoryId", "shortDescription", "description",
              "targetGroup", "materials", "careInstructions", "countryOfOrigin",
              "originalPriceMinor", "outletPriceMinor", "currencyCode", "taxClass", 'DRAFT',
              "seoTitle", "seoDescription", "searchKeywords"
         FROM "products" WHERE "id" = ?`,
      newProductId,
      slug,
      id,
    ),
  ];

  for (const variant of variants) {
    const variantId = newId();
    statements.push(
      ctx.db.statement(
        `INSERT INTO "product_variants" ("id", "productId", "sku", "size", "color", "position")
         VALUES (?, ?, ?, ?, ?, ?)`,
        variantId,
        newProductId,
        `${variant.sku}-C${suffix}`,
        variant.size,
        variant.color,
        variant.position,
      ),
      ctx.db.statement(
        `INSERT INTO "inventory_balances" ("id", "variantId", "onHandQuantity") VALUES (?, ?, 0)`,
        newId(),
        variantId,
      ),
    );
  }

  statements.push(
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'product.duplicate',
      entityType: 'Product',
      entityId: newProductId,
      after: { copiedFrom: id, slug },
    }),
  );

  await ctx.db.batch(statements);
  return c.json({ id: newProductId, slug }, 201);
});

/**
 * Bulk stock import.
 *
 * Two columns — `sku,quantity`. Rows naming an unknown SKU are skipped and
 * counted rather than failing the whole file, because a spreadsheet with one
 * stale line should not cost the operator the other four hundred.
 */
adminManage.post('/products/import/csv', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.InventoryAdjust);
  const body = parse(
    z.object({ csv: z.string().min(1).max(1_000_000) }).strict(),
    await readJson(c.req.raw),
  );

  const rows = body.csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
    // A header row is common and must not be read as a SKU.
    .filter((cells, index) => !(index === 0 && cells[0]?.toLowerCase() === 'sku'));

  if (rows.length > 5000) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'Import at most 5000 rows at a time.');
  }

  let created = 0;
  let skipped = 0;
  const now = nowIso();
  const statements = [];

  for (const [sku, rawQuantity] of rows) {
    const quantity = Number.parseInt(rawQuantity ?? '', 10);
    if (!sku || !Number.isFinite(quantity) || quantity < 0) {
      skipped += 1;
      continue;
    }
    const variant = await ctx.db.first<{ id: string; onHand: number }>(
      `SELECT v."id", COALESCE(b."onHandQuantity", 0) AS "onHand"
         FROM "product_variants" v
         LEFT JOIN "inventory_balances" b ON b."variantId" = v."id"
        WHERE v."sku" = ?`,
      sku,
    );
    if (!variant) {
      skipped += 1;
      continue;
    }

    statements.push(
      ctx.db.statement(
        `UPDATE "inventory_balances" SET "onHandQuantity" = ?, "version" = "version" + 1, "updatedAt" = ?
          WHERE "variantId" = ? AND ? >= "reservedQuantity"`,
        quantity,
        now,
        variant.id,
        quantity,
      ),
      ctx.db.statement(
        `INSERT INTO "inventory_movements"
           ("id", "variantId", "type", "quantityChange", "previousOnHand", "newOnHand", "reason", "actorUserId", "createdAt")
         VALUES (?, ?, 'CORRECTION', ?, ?, ?, 'CSV import', ?, ?)`,
        newId(),
        variant.id,
        quantity - variant.onHand,
        variant.onHand,
        quantity,
        session.user.id,
        now,
      ),
    );
    created += 1;
  }

  statements.push(
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'inventory.import',
      entityType: 'InventoryBalance',
      after: { rows: rows.length, applied: created, skipped },
    }),
  );

  await ctx.db.batch(statements);
  return c.json({ created, skipped });
});

// --- Orders: confirmation ------------------------------------------------------

/**
 * "Resend confirmation", in an environment with no email provider.
 *
 * It writes the in-app notification the customer would have been emailed, and
 * says so. Silently succeeding while sending nothing would be worse than the
 * button not existing.
 */
adminManage.post('/orders/:id/resend-confirmation', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.OrdersUpdate);
  const id = pathId(c.req.param('id'));

  const order = await ctx.db.first<{ orderNumber: string; userId: string | null; email: string }>(
    `SELECT "orderNumber", "userId", "email" FROM "orders" WHERE "id" = ?`,
    id,
  );
  if (!order) throw notFound('Order not found.');
  if (!order.userId) {
    throw new ApiError(
      'CONFLICT',
      'That order was placed as a guest, so there is no inbox to send to.',
    );
  }

  await ctx.db.batch([
    ...notify(ctx.db, {
      userId: order.userId,
      type: 'ORDER_CONFIRMATION',
      title: `Confirmation for ${order.orderNumber}`,
      body: 'A copy of your order confirmation. This demo sends no email; it appears in your account instead.',
      email: order.email,
      orderId: id,
      template: 'order_confirmation',
    }),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'order.resend_confirmation',
      entityType: 'Order',
      entityId: id,
    }),
  ]);

  return c.json({ ok: true, delivered: 'in-app', email: false });
});

// --- Reservations --------------------------------------------------------------
// The panel lists these under /admin/inventory/reservations; routes/admin.ts
// serves /admin/reservations. Both answer.

/**
 * The reservations screen, which filters by status and reads `data.items`.
 *
 * Paginated rather than a bare array for that reason: the page renders
 * `data.items.length` before anything else, so returning the rows unwrapped
 * threw during render and blanked the screen. The status filter is compared
 * against the column values, not interpolated.
 */
adminManage.get('/inventory/reservations', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ReservationsView);
  const query = c.req.query();

  const clauses: string[] = [];
  const bindings: string[] = [];
  if (query.status) {
    clauses.push(`r."status" = ?`);
    bindings.push(query.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const pageSize = Math.max(1, Math.min(200, Number(query.pageSize) || 100));
  const total = await ctx.db.count(
    `SELECT COUNT(*) AS "c" FROM "inventory_reservations" r ${where}`,
    ...bindings,
  );
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  const items = await ctx.db.all(
    `SELECT r."id", v."sku", p."name" AS "productName", r."quantity", r."status",
            u."email" AS "customerEmail", r."createdAt", r."expiresAt"
       FROM "inventory_reservations" r
       JOIN "product_variants" v ON v."id" = r."variantId"
       JOIN "products" p ON p."id" = v."productId"
       LEFT JOIN "users" u ON u."id" = r."userId"
       ${where}
      ORDER BY r."createdAt" DESC LIMIT ? OFFSET ?`,
    ...bindings,
    pageSize,
    (page - 1) * pageSize,
  );

  return c.json({ items, total, page, pageSize, totalPages });
});

// --- Refunds -----------------------------------------------------------------

/**
 * A refund issued directly against an order, without a return.
 *
 * Demo only, like the payment it reverses: the row records what a provider
 * would have done. The amount is clamped to what is actually left on the
 * payment, so no sequence of requests can refund more than was taken.
 */
adminManage.post('/orders/refunds', async (c) => {
  const ctx = ctxOf(c);
  const session = requirePermission(ctx.session, Permissions.RefundsCreate);
  const body = parse(
    z
      .object({
        orderId: z.string().trim().min(1).max(64),
        amountMinor: z.number().int().min(1).max(100_000_00),
        reason: z.string().trim().min(1).max(300),
      })
      .strict(),
    await readJson(c.req.raw),
  );

  const payment = await ctx.db.first<{
    id: string;
    amountMinor: number;
    refundedAmountMinor: number;
  }>(
    `SELECT "id", "amountMinor", "refundedAmountMinor" FROM "payments"
      WHERE "orderId" = ? AND "status" IN ('PAID', 'PARTIALLY_REFUNDED')
      ORDER BY "createdAt" LIMIT 1`,
    body.orderId,
  );
  if (!payment) throw notFound('That order has no refundable payment.');

  const remaining = payment.amountMinor - payment.refundedAmountMinor;
  if (body.amountMinor > remaining) {
    throw new ApiError('CONFLICT', `Only ${remaining} minor units are left to refund.`, {
      remainingMinor: remaining,
    });
  }

  const refundId = newId();
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.statement(
      `INSERT INTO "refunds" ("id", "orderId", "paymentId", "amountMinor", "status",
                              "providerRefundId", "reason", "createdByUserId")
       VALUES (?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?)`,
      refundId,
      body.orderId,
      payment.id,
      body.amountMinor,
      `SIM-REF-${refundId.slice(-8).toUpperCase()}`,
      body.reason,
      session.user.id,
    ),
    ctx.db.statement(
      `UPDATE "payments"
          SET "refundedAmountMinor" = "refundedAmountMinor" + ?,
              "status" = CASE WHEN "refundedAmountMinor" + ? >= "amountMinor" THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
              "updatedAt" = ?
        WHERE "id" = ?`,
      body.amountMinor,
      body.amountMinor,
      now,
      payment.id,
    ),
    auditStatement(ctx.db, session, ctx.ip, {
      action: 'refund.create',
      entityType: 'Refund',
      entityId: refundId,
      after: { orderId: body.orderId, amountMinor: body.amountMinor, demo: true },
      reason: body.reason,
    }),
  ]);

  return c.json(
    { id: refundId, amountMinor: body.amountMinor, status: 'SUCCEEDED', demo: true },
    201,
  );
});

export { fromBool, toJson };
