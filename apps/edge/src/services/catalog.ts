/**
 * Catalogue reads.
 *
 * Every listing here costs three queries regardless of how many products come
 * back: one for the page of products (with brand, category, availability and
 * campaign price folded in), one for that page's images, one for that page's
 * colourways. The obvious shape — fetch products, then loop — is an N+1 that
 * looks fine against 62 demo products and falls over against a real catalogue,
 * so it is not used anywhere in this file.
 *
 * Filtering and sorting are driven by query parameters, which means untrusted
 * strings reach a decision about SQL. They never reach the SQL itself: sort
 * keys resolve through an allow-list to a fixed fragment, and every value is a
 * bound parameter.
 */

import type {
  Paginated,
  ProductDetailDto,
  ProductImageDto,
  ProductListItemDto,
  SearchSuggestionsDto,
  TargetGroup,
  VariantDto,
} from '@outlet/types';
import { Db, allowListed, fromBool, nowIso, parseJson, type SqlValue } from '../lib/sql';

export interface ListProductsParams {
  q?: string;
  category?: string;
  brand?: string;
  size?: string;
  color?: string;
  targetGroup?: string;
  campaign?: string;
  minPrice?: string;
  maxPrice?: string;
  minDiscount?: string;
  minRating?: string;
  inStock?: string;
  sale?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}

/**
 * The only sort expressions the API will ever run.
 *
 * `sort=` arrives from the URL. Looking the value up in this map — rather than
 * interpolating it — is what stops `?sort=name; DROP TABLE` from being a
 * question worth asking.
 */
const SORT_EXPRESSIONS = {
  recommended: `(CASE WHEN "totalAvailable" > 0 THEN 0 ELSE 1 END) ASC, "discountPercent" DESC, "name" ASC`,
  newest: `"createdAt" DESC`,
  price_asc: `"currentPriceMinor" ASC`,
  price_desc: `"currentPriceMinor" DESC`,
  discount: `"discountPercent" DESC`,
  // Unreviewed products sort last rather than tying with one-star ones.
  rating: `(CASE WHEN "reviewCount" = 0 THEN 1 ELSE 0 END) ASC, "ratingAverage" DESC, "reviewCount" DESC`,
  popularity: `"soldUnits" DESC, "reviewCount" DESC`,
} as const;

type SortKey = keyof typeof SORT_EXPRESSIONS;

/** Rows the product SELECT produces, before DTO assembly. */
interface ProductRow {
  id: string;
  name: string;
  slug: string;
  targetGroup: TargetGroup;
  originalPriceMinor: number;
  currentPriceMinor: number;
  discountPercent: number;
  currencyCode: string;
  createdAt: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  campaignId: string | null;
  campaignSlug: string | null;
  totalAvailable: number;
  ratingAverage: number | null;
  reviewCount: number;
}

/**
 * Shared SQL: the projection every product listing selects from.
 *
 * Written once because the list endpoint, the related-products endpoint and
 * the recommendation endpoint must agree on what "current price" and
 * "available" mean. Two of them disagreeing is how a product shows €39 in a
 * grid and €49 on its own page.
 *
 * Takes the current timestamp twice (campaign window start and end).
 */
function productProjection(): string {
  return `
    WITH "availability" AS (
      SELECT v."productId" AS "pid",
             SUM(CASE WHEN v."isEnabled" = 1
                      THEN MAX(0, COALESCE(b."onHandQuantity", 0) - COALESCE(b."reservedQuantity", 0))
                      ELSE 0 END) AS "available"
        FROM "product_variants" v
        LEFT JOIN "inventory_balances" b ON b."variantId" = v."id"
       GROUP BY v."productId"
    ),
    "sold" AS (
      SELECT v."productId" AS "pid", SUM(COALESCE(b."soldQuantity", 0)) AS "units"
        FROM "product_variants" v
        LEFT JOIN "inventory_balances" b ON b."variantId" = v."id"
       GROUP BY v."productId"
    ),
    "campaign" AS (
      SELECT "pid", "cid", "cslug", "price" FROM (
        SELECT cp."productId" AS "pid",
               ca."id" AS "cid",
               ca."slug" AS "cslug",
               COALESCE(cp."campaignPriceMinor", pr."outletPriceMinor") AS "price",
               ROW_NUMBER() OVER (
                 PARTITION BY cp."productId"
                 ORDER BY COALESCE(cp."campaignPriceMinor", pr."outletPriceMinor") ASC, ca."position" ASC
               ) AS "rn"
          FROM "campaign_products" cp
          JOIN "campaigns" ca ON ca."id" = cp."campaignId"
          JOIN "products" pr ON pr."id" = cp."productId"
         WHERE ca."status" = 'ACTIVE' AND ca."isVisible" = 1
           AND ca."startsAt" <= ? AND ca."endsAt" > ?
      ) WHERE "rn" = 1
    ),
    "listing" AS (
      SELECT p."id"                 AS "id",
             p."name"               AS "name",
             p."slug"               AS "slug",
             p."targetGroup"        AS "targetGroup",
             p."originalPriceMinor" AS "originalPriceMinor",
             MIN(COALESCE(cm."price", p."outletPriceMinor"), p."outletPriceMinor") AS "currentPriceMinor",
             CASE WHEN p."originalPriceMinor" > 0
                  THEN CAST(ROUND(
                         (p."originalPriceMinor" - MIN(COALESCE(cm."price", p."outletPriceMinor"), p."outletPriceMinor"))
                         * 100.0 / p."originalPriceMinor") AS INTEGER)
                  ELSE 0 END        AS "discountPercent",
             p."currencyCode"       AS "currencyCode",
             p."createdAt"          AS "createdAt",
             p."searchKeywords"     AS "searchKeywords",
             p."shortDescription"   AS "shortDescription",
             b."id"                 AS "brandId",
             b."name"               AS "brandName",
             b."slug"               AS "brandSlug",
             c."id"                 AS "categoryId",
             c."name"               AS "categoryName",
             c."slug"               AS "categorySlug",
             cm."cid"               AS "campaignId",
             cm."cslug"             AS "campaignSlug",
             COALESCE(av."available", 0) AS "totalAvailable",
             COALESCE(sl."units", 0)     AS "soldUnits",
             CASE WHEN p."reviewCount" > 0
                  THEN ROUND(p."ratingSum" * 1.0 / p."reviewCount", 1)
                  ELSE NULL END     AS "ratingAverage",
             p."reviewCount"        AS "reviewCount"
        FROM "products" p
        JOIN "brands" b ON b."id" = p."brandId"
        LEFT JOIN "categories" c ON c."id" = p."categoryId"
        LEFT JOIN "availability" av ON av."pid" = p."id"
        LEFT JOIN "sold" sl ON sl."pid" = p."id"
        LEFT JOIN "campaign" cm ON cm."pid" = p."id"
       WHERE p."status" = 'ACTIVE' AND b."isActive" = 1
    )
  `;
}

/**
 * Every descendant of a category slug, inclusive.
 *
 * Selecting "Women" must return everything under Women → Clothing → Dresses,
 * so the tree is walked in SQL with a recursive CTE rather than by loading the
 * whole category table and walking it in JavaScript.
 */
async function categorySubtreeIds(db: Db, slug: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>(
    `WITH RECURSIVE "subtree"("id") AS (
       SELECT "id" FROM "categories" WHERE "slug" = ?
       UNION ALL
       SELECT c."id" FROM "categories" c JOIN "subtree" s ON c."parentId" = s."id"
     )
     SELECT "id" FROM "subtree"`,
    slug,
  );
  return rows.map((row) => row.id);
}

interface FilterFragment {
  sql: string;
  bindings: SqlValue[];
}

async function buildFilters(db: Db, params: ListProductsParams): Promise<FilterFragment> {
  const clauses: string[] = [];
  const bindings: SqlValue[] = [];

  if (params.q) {
    const needle = `%${params.q.trim().toLowerCase()}%`;
    clauses.push(
      `(LOWER("name") LIKE ? OR LOWER("brandName") LIKE ?
        OR LOWER(COALESCE("searchKeywords", '')) LIKE ?
        OR LOWER(COALESCE("shortDescription", '')) LIKE ?)`,
    );
    bindings.push(needle, needle, needle, needle);
  }

  if (params.category) {
    const ids = await categorySubtreeIds(db, params.category);
    if (ids.length === 0) return { sql: '0 = 1', bindings: [] };
    clauses.push(`"categoryId" IN (${ids.map(() => '?').join(', ')})`);
    bindings.push(...ids);
  }

  if (params.brand) {
    clauses.push(`"brandSlug" = ?`);
    bindings.push(params.brand);
  }

  if (params.targetGroup) {
    clauses.push(`"targetGroup" = ?`);
    bindings.push(params.targetGroup);
  }

  if (params.campaign) {
    clauses.push(
      `"id" IN (SELECT cp."productId" FROM "campaign_products" cp
                  JOIN "campaigns" ca ON ca."id" = cp."campaignId"
                 WHERE ca."slug" = ?)`,
    );
    bindings.push(params.campaign);
  }

  // Size and colour live on variants, so they are existence tests rather than
  // column comparisons — a product matches if *any* of its variants does.
  if (params.size) {
    clauses.push(`EXISTS (SELECT 1 FROM "product_variants" v
                           WHERE v."productId" = "listing"."id" AND v."size" = ? AND v."isEnabled" = 1)`);
    bindings.push(params.size);
  }
  if (params.color) {
    clauses.push(`EXISTS (SELECT 1 FROM "product_variants" v
                           WHERE v."productId" = "listing"."id" AND v."color" = ? AND v."isEnabled" = 1)`);
    bindings.push(params.color);
  }

  // Prices arrive in major units from the URL and are compared in minor units.
  const minPrice = Number(params.minPrice);
  if (Number.isFinite(minPrice)) {
    clauses.push(`"currentPriceMinor" >= ?`);
    bindings.push(Math.round(minPrice * 100));
  }
  const maxPrice = Number(params.maxPrice);
  if (Number.isFinite(maxPrice)) {
    clauses.push(`"currentPriceMinor" <= ?`);
    bindings.push(Math.round(maxPrice * 100));
  }

  const minDiscount = Number(params.minDiscount);
  if (Number.isFinite(minDiscount)) {
    clauses.push(`"discountPercent" >= ?`);
    bindings.push(minDiscount);
  }

  const minRating = Number(params.minRating);
  if (Number.isFinite(minRating)) {
    clauses.push(`COALESCE("ratingAverage", 0) >= ?`);
    bindings.push(minRating);
  }

  if (params.inStock === 'true') clauses.push(`"totalAvailable" > 0`);
  if (params.sale === 'true') clauses.push(`"discountPercent" > 0`);

  return { sql: clauses.length ? clauses.join(' AND ') : '1 = 1', bindings };
}

/** First two images per product, for the tile and its hover state. */
async function imagesForProducts(
  db: Db,
  productIds: string[],
): Promise<Map<string, ProductImageDto[]>> {
  const byProduct = new Map<string, ProductImageDto[]>();
  if (productIds.length === 0) return byProduct;

  const rows = await db.all<{
    id: string;
    productId: string;
    url: string;
    altText: string | null;
    position: number;
    variantId: string | null;
  }>(
    `SELECT "id", "productId", "url", "altText", "position", "variantId"
       FROM "product_images"
      WHERE "productId" IN (${productIds.map(() => '?').join(', ')})
      ORDER BY "productId", "position"`,
    ...productIds,
  );

  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({
      id: row.id,
      url: row.url,
      altText: row.altText,
      position: row.position,
      variantId: row.variantId,
    });
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

async function colorsForProducts(db: Db, productIds: string[]): Promise<Map<string, string[]>> {
  const byProduct = new Map<string, string[]>();
  if (productIds.length === 0) return byProduct;

  const rows = await db.all<{ productId: string; color: string }>(
    `SELECT DISTINCT "productId", "color"
       FROM "product_variants"
      WHERE "productId" IN (${productIds.map(() => '?').join(', ')})
        AND "color" IS NOT NULL AND "isEnabled" = 1
      ORDER BY "productId", "position"`,
    ...productIds,
  );

  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    if (!list.includes(row.color)) list.push(row.color);
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

function toListItem(
  row: ProductRow,
  images: ProductImageDto[],
  colors: string[],
): ProductListItemDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brand: { id: row.brandId, name: row.brandName, slug: row.brandSlug },
    category:
      row.categoryId && row.categoryName && row.categorySlug
        ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug }
        : null,
    targetGroup: row.targetGroup,
    originalPriceMinor: row.originalPriceMinor,
    currentPriceMinor: row.currentPriceMinor,
    discountPercent: row.discountPercent,
    currencyCode: row.currencyCode,
    imageUrl: images[0]?.url ?? null,
    hoverImageUrl: images[1]?.url ?? null,
    colors,
    campaignId: row.campaignId,
    campaignSlug: row.campaignSlug,
    totalAvailable: row.totalAvailable,
    ratingAverage: row.ratingAverage,
    reviewCount: row.reviewCount,
    createdAt: row.createdAt,
  };
}

export async function listProducts(
  db: Db,
  params: ListProductsParams,
): Promise<Paginated<ProductListItemDto>> {
  const now = nowIso();
  const filters = await buildFilters(db, params);
  const projection = productProjection();

  const pageSize = Math.max(1, Math.min(96, Number(params.pageSize) || 24));
  const requestedPage = Math.max(1, Number(params.page) || 1);

  const total = await db.count(
    `${projection} SELECT COUNT(*) AS "c" FROM "listing" WHERE ${filters.sql}`,
    now,
    now,
    ...filters.bindings,
  );

  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const orderBy = allowListed<SortKey>(params.sort, SORT_EXPRESSIONS, 'recommended');

  const rows = await db.all<ProductRow>(
    `${projection}
     SELECT * FROM "listing"
      WHERE ${filters.sql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    now,
    now,
    ...filters.bindings,
    pageSize,
    offset,
  );

  const ids = rows.map((row) => row.id);
  const [images, colors] = await Promise.all([
    imagesForProducts(db, ids),
    colorsForProducts(db, ids),
  ]);

  return {
    items: rows.map((row) => toListItem(row, images.get(row.id) ?? [], colors.get(row.id) ?? [])),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getProductBySlug(db: Db, slug: string): Promise<ProductDetailDto | null> {
  const now = nowIso();
  const row = await db.first<
    ProductRow & {
      shortDescription: string | null;
      description: string | null;
      materials: string | null;
      careInstructions: string | null;
      countryOfOrigin: string | null;
      status: ProductDetailDto['status'];
      taxClass: ProductDetailDto['taxClass'];
      seoTitle: string | null;
      seoDescription: string | null;
      sizeChartGroup: ProductDetailDto['sizeChartGroup'];
    }
  >(
    `${productProjection()}
     SELECT l.*, p."description", p."materials", p."careInstructions", p."countryOfOrigin",
            p."status", p."taxClass", p."seoTitle", p."seoDescription", c."sizeChartGroup"
       FROM "listing" l
       JOIN "products" p ON p."id" = l."id"
       LEFT JOIN "categories" c ON c."id" = p."categoryId"
      WHERE l."slug" = ?`,
    now,
    now,
    slug,
  );

  if (!row) return null;

  const [variants, imageRows, colors] = await Promise.all([
    variantsForProduct(db, row.id, row.currentPriceMinor),
    imagesForProducts(db, [row.id]),
    colorsForProducts(db, [row.id]),
  ]);
  const images = imageRows.get(row.id) ?? [];

  return {
    ...toListItem(row, images, colors.get(row.id) ?? []),
    sizeChartGroup: row.sizeChartGroup,
    shortDescription: row.shortDescription,
    description: row.description,
    materials: row.materials,
    careInstructions: row.careInstructions,
    countryOfOrigin: row.countryOfOrigin,
    status: row.status,
    taxClass: row.taxClass,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    images,
    variants,
  };
}

/**
 * Variants with their sellable quantity.
 *
 * `availableQuantity` is on-hand minus reserved, floored at zero, which is what
 * the product page turns into "Only 2 left" or a disabled size button. A
 * variant whose price is overridden keeps its own price; everything else
 * inherits the product's current price, campaign included.
 */
export async function variantsForProduct(
  db: Db,
  productId: string,
  currentPriceMinor: number,
): Promise<VariantDto[]> {
  const rows = await db.all<{
    id: string;
    sku: string;
    barcode: string | null;
    size: string | null;
    color: string | null;
    priceOverrideMinor: number | null;
    isEnabled: number;
    attributes: string | null;
    available: number;
  }>(
    `SELECT v."id", v."sku", v."barcode", v."size", v."color", v."priceOverrideMinor",
            v."isEnabled", v."attributes",
            MAX(0, COALESCE(b."onHandQuantity", 0) - COALESCE(b."reservedQuantity", 0)) AS "available"
       FROM "product_variants" v
       LEFT JOIN "inventory_balances" b ON b."variantId" = v."id"
      WHERE v."productId" = ?
      ORDER BY v."position", v."sku"`,
    productId,
  );

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    size: row.size,
    color: row.color,
    priceMinor: row.priceOverrideMinor ?? currentPriceMinor,
    isEnabled: fromBool(row.isEnabled),
    availableQuantity: row.available,
    attributes: parseJson<Record<string, string> | null>(row.attributes, null),
  }));
}

/** Same brand or category, excluding the product itself. */
export async function relatedProducts(
  db: Db,
  slug: string,
  limit: number,
): Promise<ProductListItemDto[]> {
  const anchor = await db.first<{ id: string; brandId: string; categoryId: string | null }>(
    `SELECT "id", "brandId", "categoryId" FROM "products" WHERE "slug" = ?`,
    slug,
  );
  if (!anchor) return [];

  const now = nowIso();
  const rows = await db.all<ProductRow>(
    `${productProjection()}
     SELECT l.* FROM "listing" l
       JOIN "products" p ON p."id" = l."id"
      WHERE l."id" <> ?
        AND (p."categoryId" = ? OR p."brandId" = ?)
      ORDER BY (CASE WHEN p."categoryId" = ? THEN 0 ELSE 1 END) ASC,
               l."totalAvailable" > 0 DESC,
               l."discountPercent" DESC
      LIMIT ?`,
    now,
    now,
    anchor.id,
    anchor.categoryId,
    anchor.brandId,
    anchor.categoryId,
    Math.max(1, Math.min(24, limit)),
  );

  const ids = rows.map((row) => row.id);
  const [images, colors] = await Promise.all([
    imagesForProducts(db, ids),
    colorsForProducts(db, ids),
  ]);
  return rows.map((row) => toListItem(row, images.get(row.id) ?? [], colors.get(row.id) ?? []));
}

export async function searchSuggestions(db: Db, query: string): Promise<SearchSuggestionsDto> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { products: [], brands: [], categories: [] };
  const needle = `%${trimmed.toLowerCase()}%`;
  const now = nowIso();

  const [products, brands, categories] = await Promise.all([
    db.all<{ name: string; slug: string; currentPriceMinor: number; url: string | null }>(
      `${productProjection()}
       SELECT l."name", l."slug", l."currentPriceMinor",
              (SELECT i."url" FROM "product_images" i
                WHERE i."productId" = l."id" ORDER BY i."position" LIMIT 1) AS "url"
         FROM "listing" l
        WHERE LOWER(l."name") LIKE ? OR LOWER(l."brandName") LIKE ?
        ORDER BY l."totalAvailable" > 0 DESC, l."name"
        LIMIT 6`,
      now,
      now,
      needle,
      needle,
    ),
    db.all<{ name: string; slug: string }>(
      `SELECT "name", "slug" FROM "brands"
        WHERE "isActive" = 1 AND LOWER("name") LIKE ? ORDER BY "name" LIMIT 4`,
      needle,
    ),
    db.all<{ name: string; slug: string }>(
      `SELECT "name", "slug" FROM "categories"
        WHERE "isActive" = 1 AND LOWER("name") LIKE ? ORDER BY "position" LIMIT 4`,
      needle,
    ),
  ]);

  return {
    products: products.map((row) => ({
      name: row.name,
      slug: row.slug,
      imageUrl: row.url,
      currentPriceMinor: row.currentPriceMinor,
    })),
    brands,
    categories,
  };
}
