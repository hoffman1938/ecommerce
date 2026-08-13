/**
 * Catalogue reads, against the real schema and the real seed.
 *
 * These assert on behaviour a shopper would notice — that a filter narrows the
 * result, that a sort actually orders, that a sold-out variant reports zero —
 * rather than on the SQL that produces it.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../src/lib/sql';
import {
  getProductBySlug,
  listProducts,
  relatedProducts,
  searchSuggestions,
} from '../src/services/catalog';
import { createSeededDatabase, type TestDatabase } from './helpers/d1';

let database: TestDatabase;
let db: Db;

beforeAll(async () => {
  database = await createSeededDatabase();
  db = new Db(database.d1 as unknown as D1Database);
});

describe('listProducts', () => {
  it('returns a populated first page', async () => {
    const page = await listProducts(db, {});
    expect(page.total).toBeGreaterThanOrEqual(40);
    expect(page.items).toHaveLength(24);
    expect(page.page).toBe(1);
  });

  it('gives every tile the fields a listing card needs', async () => {
    const page = await listProducts(db, { pageSize: '5' });
    for (const item of page.items) {
      expect(item.name).toBeTruthy();
      expect(item.brand.name).toBeTruthy();
      expect(item.imageUrl).toBeTruthy();
      expect(item.currentPriceMinor).toBeGreaterThan(0);
      expect(item.originalPriceMinor).toBeGreaterThanOrEqual(item.currentPriceMinor);
    }
  });

  it('filters by brand', async () => {
    const page = await listProducts(db, { brand: 'aster', pageSize: '96' });
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((item) => item.brand.slug === 'aster')).toBe(true);
  });

  it('filters a department down its whole subtree', async () => {
    const department = await listProducts(db, { category: 'women', pageSize: '96' });
    const subcategory = await listProducts(db, { category: 'women-dresses', pageSize: '96' });
    expect(department.total).toBeGreaterThan(0);
    // A department must include everything beneath it, so it cannot return
    // fewer products than one of its own subcategories.
    expect(department.total).toBeGreaterThanOrEqual(subcategory.total);
  });

  it('filters by audience', async () => {
    const page = await listProducts(db, { targetGroup: 'KIDS', pageSize: '96' });
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((item) => item.targetGroup === 'KIDS')).toBe(true);
  });

  it('filters by size and colour through variants', async () => {
    const size = await listProducts(db, { size: 'M', pageSize: '96' });
    const colour = await listProducts(db, { color: 'Black', pageSize: '96' });
    expect(size.total).toBeGreaterThan(0);
    expect(colour.total).toBeGreaterThan(0);
    expect(colour.items.every((item) => item.colors.includes('Black'))).toBe(true);
  });

  it('filters by price range in major units', async () => {
    const page = await listProducts(db, { minPrice: '20', maxPrice: '40', pageSize: '96' });
    expect(page.total).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.currentPriceMinor).toBeGreaterThanOrEqual(2000);
      expect(item.currentPriceMinor).toBeLessThanOrEqual(4000);
    }
  });

  it('filters to in-stock only', async () => {
    const all = await listProducts(db, { pageSize: '96' });
    const inStock = await listProducts(db, { inStock: 'true', pageSize: '96' });
    expect(inStock.total).toBeGreaterThan(0);
    expect(inStock.total).toBeLessThanOrEqual(all.total);
    expect(inStock.items.every((item) => item.totalAvailable > 0)).toBe(true);
  });

  it('filters to discounted only', async () => {
    const page = await listProducts(db, { sale: 'true', pageSize: '96' });
    expect(page.items.every((item) => item.discountPercent > 0)).toBe(true);
  });

  it('sorts by price ascending and descending', async () => {
    const asc = await listProducts(db, { sort: 'price_asc', pageSize: '30' });
    const desc = await listProducts(db, { sort: 'price_desc', pageSize: '30' });
    const ascPrices = asc.items.map((i) => i.currentPriceMinor);
    const descPrices = desc.items.map((i) => i.currentPriceMinor);
    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
    expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
  });

  it('sorts newest first', async () => {
    const page = await listProducts(db, { sort: 'newest', pageSize: '10' });
    const dates = page.items.map((i) => Date.parse(i.createdAt));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('sorts unreviewed products last when sorting by rating', async () => {
    const page = await listProducts(db, { sort: 'rating', pageSize: '96' });
    const firstUnreviewed = page.items.findIndex((i) => i.reviewCount === 0);
    if (firstUnreviewed !== -1) {
      expect(page.items.slice(firstUnreviewed).every((i) => i.reviewCount === 0)).toBe(true);
    }
  });

  it('ignores an unknown sort key rather than trusting it', async () => {
    const injected = await listProducts(db, { sort: '"name"; DROP TABLE products; --', pageSize: '5' });
    const fallback = await listProducts(db, { pageSize: '5' });
    expect(injected.items.map((i) => i.slug)).toEqual(fallback.items.map((i) => i.slug));
    // The table is still there.
    expect((await listProducts(db, {})).total).toBeGreaterThan(0);
  });

  it('treats a search term as data, not SQL', async () => {
    const page = await listProducts(db, { q: "' OR 1=1 --" });
    expect(page.total).toBe(0);
    expect((await listProducts(db, {})).total).toBeGreaterThan(0);
  });

  it('searches names and brands', async () => {
    const page = await listProducts(db, { q: 'hoodie', pageSize: '96' });
    expect(page.total).toBeGreaterThan(0);
    expect(
      page.items.every(
        (item) =>
          item.name.toLowerCase().includes('hoodie') || item.brand.name.toLowerCase().includes('hoodie'),
      ),
    ).toBe(true);
  });

  it('paginates without overlap and clamps an out-of-range page', async () => {
    const first = await listProducts(db, { pageSize: '10', page: '1', sort: 'newest' });
    const second = await listProducts(db, { pageSize: '10', page: '2', sort: 'newest' });
    const overlap = first.items.filter((a) => second.items.some((b) => b.id === a.id));
    expect(overlap).toHaveLength(0);

    const beyond = await listProducts(db, { pageSize: '10', page: '9999' });
    expect(beyond.page).toBe(beyond.totalPages);
  });

  it('caps the page size so one request cannot ask for everything', async () => {
    const page = await listProducts(db, { pageSize: '100000' });
    expect(page.pageSize).toBe(96);
  });

  it('prices a product in a running campaign below its outlet price', async () => {
    const page = await listProducts(db, { campaign: 'aster-outlet-sale', pageSize: '96' });
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((item) => item.campaignSlug !== null)).toBe(true);
    expect(page.items.every((item) => item.currentPriceMinor < item.originalPriceMinor)).toBe(true);
  });
});

describe('getProductBySlug', () => {
  it('returns the detail a product page renders', async () => {
    const product = await getProductBySlug(db, 'aster-essential-cotton-t-shirt');
    expect(product).not.toBeNull();
    expect(product!.name).toBe('Aster Essential Cotton T-Shirt');
    expect(product!.brand.name).toBe('Aster');
    expect(product!.description).toBeTruthy();
    expect(product!.materials).toBeTruthy();
    expect(product!.careInstructions).toBeTruthy();
    expect(product!.countryOfOrigin).toBeTruthy();
    expect(product!.images.length).toBeGreaterThan(0);
    expect(product!.variants.length).toBeGreaterThan(0);
  });

  it('gives each variant its own sellable quantity', async () => {
    const product = await getProductBySlug(db, 'aster-essential-cotton-t-shirt');
    for (const variant of product!.variants) {
      expect(variant.sku).toBeTruthy();
      expect(variant.availableQuantity).toBeGreaterThanOrEqual(0);
      expect(variant.priceMinor).toBeGreaterThan(0);
    }
  });

  it('reports a sold-out product as unavailable rather than hiding it', async () => {
    const soldOut = await db.first<{ slug: string }>(
      `SELECT p."slug" FROM "products" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "product_variants" v
            JOIN "inventory_balances" b ON b."variantId" = v."id"
           WHERE v."productId" = p."id" AND b."onHandQuantity" > 0)
        LIMIT 1`,
    );
    expect(soldOut).not.toBeNull();
    const product = await getProductBySlug(db, soldOut!.slug);
    expect(product!.totalAvailable).toBe(0);
    expect(product!.variants.every((v) => v.availableQuantity === 0)).toBe(true);
  });

  it('returns null for a slug that does not exist', async () => {
    expect(await getProductBySlug(db, 'no-such-product')).toBeNull();
  });

  it('carries the size chart only for sized garments', async () => {
    const tee = await getProductBySlug(db, 'aster-essential-cotton-t-shirt');
    const bag = await getProductBySlug(db, 'aster-linear-duffel-bag');
    expect(tee!.sizeChartGroup).toBeTruthy();
    expect(bag!.sizeChartGroup).toBeNull();
  });
});

describe('relatedProducts', () => {
  it('returns other products and never the anchor itself', async () => {
    const related = await relatedProducts(db, 'aster-essential-cotton-t-shirt', 4);
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((item) => item.slug !== 'aster-essential-cotton-t-shirt')).toBe(true);
  });
});

describe('searchSuggestions', () => {
  it('suggests products, brands and categories', async () => {
    const suggestions = await searchSuggestions(db, 'aster');
    expect(suggestions.products.length).toBeGreaterThan(0);
    expect(suggestions.brands.some((b) => b.slug === 'aster')).toBe(true);
  });

  it('stays quiet for a single character', async () => {
    const suggestions = await searchSuggestions(db, 'a');
    expect(suggestions.products).toHaveLength(0);
    expect(suggestions.brands).toHaveLength(0);
  });
});
