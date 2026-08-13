'use client';

/**
 * Creating and editing products without a server.
 *
 * The point of implementing this in the demo — rather than refusing the write
 * as the panel used to — is that product lifecycle is what drives category
 * visibility. Adding an available product to an empty category has to make that
 * category appear in the shop, and archiving the last one has to make it
 * disappear again; neither is demonstrable if products cannot be created.
 */

import {
  createProductRecord,
  deleteProductRecord,
  effectiveCategories,
  effectiveProducts,
  patchProductRecord,
  type CatalogProductSpec,
} from '@outlet/catalog';
import type { ProductStatus, TargetGroup } from '@outlet/types';
import type { ProductShape } from '@outlet/catalog';

export class ProductError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProductError';
  }
}

/** Silhouettes are chosen per product; this is a sane guess from its category. */
const SHAPE_BY_SEGMENT: Record<string, ProductShape> = {
  't-shirts': 'tee',
  tops: 'tee',
  polos: 'polo',
  shirts: 'polo',
  dresses: 'tee',
  hoodies: 'hoodie',
  sweaters: 'hoodie',
  jackets: 'jacket',
  coats: 'jacket',
  jeans: 'pants',
  trousers: 'pants',
  shorts: 'shorts',
  skirts: 'shorts',
  sneakers: 'sneaker',
  'running-shoes': 'runner',
  boots: 'boot',
  loafers: 'sneaker',
  'formal-shoes': 'boot',
  heels: 'boot',
  flats: 'sneaker',
  sandals: 'sneaker',
  backpacks: 'backpack',
  bags: 'shoulder-bag',
  belts: 'belt',
  wallets: 'wallet',
  hats: 'cap',
  sunglasses: 'cap',
  scarves: 'scarf',
  socks: 'socks',
};

/** Default size runs, so a new product has something to sell. */
const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['40', '41', '42', '43', '44'];
const KIDS_SIZES = ['4Y', '6Y', '8Y', '10Y', '12Y'];
const ONE_SIZE = ['One Size'];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function defaultsFor(categorySlug: string, targetGroup: TargetGroup) {
  const category = effectiveCategories().find((row) => row.slug === categorySlug);
  const segment = category?.pathSegment ?? '';
  const shape = SHAPE_BY_SEGMENT[segment] ?? 'tee';
  const isFootwear = ['sneaker', 'runner', 'boot'].includes(shape);
  const isAccessory = ['backpack', 'shoulder-bag', 'wallet', 'cap', 'scarf', 'socks'].includes(
    shape,
  );

  const sizes = isAccessory
    ? ONE_SIZE
    : targetGroup === 'KIDS'
      ? KIDS_SIZES
      : isFootwear
        ? SHOE_SIZES
        : CLOTHING_SIZES;

  return { shape, sizes };
}

interface ProductBody {
  [key: string]: unknown;
}

function text(body: ProductBody, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function money(body: ProductBody, key: string): number {
  const value = Number(body[key]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * The category is identified by slug here (the demo has no ids), and the
 * product's audience is taken from it rather than trusted from the form — a
 * product filed under Women's Heels is womenswear whatever the dropdown said.
 */
function resolveCategory(body: ProductBody): { slug: string; targetGroup: TargetGroup } {
  const requested = text(body, 'categoryId');
  const category = effectiveCategories().find((row) => row.slug === requested);
  if (!category) throw new ProductError(400, 'Choose a category for the product.');
  if (category.level === 'department') {
    throw new ProductError(400, 'Choose a category or subcategory, not a whole department.');
  }
  return { slug: category.slug, targetGroup: category.targetGroup };
}

export function createProduct(body: ProductBody): CatalogProductSpec {
  const name = text(body, 'name');
  if (!name) throw new ProductError(400, 'A product needs a name.');
  const slug = slugify(text(body, 'slug') || name);
  if (effectiveProducts().some((product) => product.slug === slug)) {
    throw new ProductError(409, `A product with the slug “${slug}” already exists.`);
  }

  const category = resolveCategory(body);
  const original = money(body, 'originalPriceMinor');
  const outlet = money(body, 'outletPriceMinor');
  if (original <= 0 || outlet <= 0) throw new ProductError(400, 'Both prices must be above zero.');

  const { shape, sizes } = defaultsFor(category.slug, category.targetGroup);
  const spec: Omit<CatalogProductSpec, 'isCustom'> = {
    name,
    slug,
    skuCode: slug.slice(0, 12).toUpperCase(),
    brand: text(body, 'brandId').replace(/^brand_/, '') || 'aster',
    category: category.slug,
    targetGroup: category.targetGroup,
    originalPriceMinor: original,
    outletPriceMinor: outlet,
    sizes,
    colors: ['Black', 'White'],
    stock: 'normal',
    shape,
    shortDescription: text(body, 'shortDescription') || `${name} — outlet price.`,
    materials: text(body, 'materials') || undefined,
    careInstructions: text(body, 'careInstructions') || undefined,
    countryOfOrigin: text(body, 'countryOfOrigin') || undefined,
    status: (text(body, 'status') || 'DRAFT') as ProductStatus,
    createdAt: new Date().toISOString(),
  };

  createProductRecord(spec);
  return { ...spec, isCustom: true };
}

export function updateProduct(id: string, body: ProductBody): CatalogProductSpec {
  const slug = id.replace(/^prod_/, '');
  const existing = effectiveProducts().find((product) => product.slug === slug);
  if (!existing) throw new ProductError(404, 'Product not found');

  const category = text(body, 'categoryId') ? resolveCategory(body) : null;
  patchProductRecord(slug, {
    ...(text(body, 'name') ? { name: text(body, 'name') } : {}),
    ...(text(body, 'shortDescription') ? { shortDescription: text(body, 'shortDescription') } : {}),
    ...(money(body, 'originalPriceMinor')
      ? { originalPriceMinor: money(body, 'originalPriceMinor') }
      : {}),
    ...(money(body, 'outletPriceMinor')
      ? { outletPriceMinor: money(body, 'outletPriceMinor') }
      : {}),
    ...(text(body, 'status') ? { status: text(body, 'status') as ProductStatus } : {}),
    ...(category ? { category: category.slug, targetGroup: category.targetGroup } : {}),
  });

  return effectiveProducts().find((product) => product.slug === slug)!;
}

export function archiveProduct(id: string): CatalogProductSpec {
  const slug = id.replace(/^prod_/, '');
  const existing = effectiveProducts().find((product) => product.slug === slug);
  if (!existing) throw new ProductError(404, 'Product not found');
  patchProductRecord(slug, { status: 'ARCHIVED' });
  return { ...existing, status: 'ARCHIVED' };
}

export function removeProduct(id: string): void {
  deleteProductRecord(id.replace(/^prod_/, ''));
}
