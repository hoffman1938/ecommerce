/**
 * Materialised demo catalog for the Cloudflare Pages build.
 *
 * Cloudflare Pages serves static assets and edge functions — it cannot host the
 * NestJS API, PostgreSQL, Redis or MinIO that back the real product. To make the
 * storefront genuinely browsable when deployed there, this module expands the
 * shared catalogue spec (@outlet/catalog — the same one the Prisma seed writes
 * to Postgres) into ready-to-render records: variants with stock, generated
 * artwork as inline data URIs, campaign pricing and reviews.
 *
 * Product data itself is *not* defined here. Change packages/catalog to change
 * the shop, and both the API-backed and static builds move together.
 */

import {
  BRANDS,
  CAMPAIGNS,
  CONTENT_PAGES,
  CURRENCY_CODE,
  DEFAULT_CARE_INSTRUCTIONS,
  DEFAULT_COUNTRY_OF_ORIGIN,
  SETTINGS,
  PRODUCT_VIEWS,
  buildCategoryTree,
  categoryArtworkDataUri,
  descriptionFor,
  effectiveCategories,
  effectiveProducts,
  productArtworkAlt,
  productArtworkDataUri,
  quantityFor,
  skuFor,
  type BrandSpec,
  type CatalogProductSpec,
  type CategoryRow,
  type CategoryTreeNode,
  type DirectCounts,
} from '@outlet/catalog';
import {
  aggregateReviews,
  generateReviews,
  reviewKindForCategory,
  type GeneratedReview,
} from '@outlet/domain';
import type { ProductStatus, TargetGroup } from '@outlet/types';

export { CONTENT_PAGES, CURRENCY_CODE, SETTINGS };

/**
 * Where the generated artwork is served from.
 *
 * Real files under `public/`, not inline `data:` URIs. Inlining a ~10 KB SVG
 * per image put ~350 KB of duplicated URI into every statically exported
 * product page, and did not survive Next's HTML serialisation intact — the
 * images arrived corrupted and failed to decode. See
 * infrastructure/scripts/generate-artwork.mjs, which writes this directory.
 */
export const ARTWORK_BASE = '/artwork';

export function productImageUrl(slug: string, color: string, view: string): string {
  return `${ARTWORK_BASE}/products/${slug}/${color.toLowerCase()}-${view}.svg`;
}

/**
 * Category tiles come from the pre-generated files where they exist, and are
 * drawn on the spot where they do not — a category an administrator created in
 * this browser has no file on disk, and a broken image is worse than an
 * inlined one.
 */
export function categoryImageUrl(slug: string, name: string, isCustom: boolean): string {
  return isCustom ? categoryArtworkDataUri(slug, name) : `${ARTWORK_BASE}/categories/${slug}.svg`;
}

export function brandImageUrl(slug: string): string {
  return `${ARTWORK_BASE}/brands/${slug}.svg`;
}

export function campaignImageUrl(slug: string): string {
  return `${ARTWORK_BASE}/campaigns/${slug}.svg`;
}
export type DemoBrand = BrandSpec;
export { BRANDS };

// --- Materialised records ---------------------------------------------------

export interface DemoVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  position: number;
  onHandQuantity: number;
}

export interface DemoImage {
  id: string;
  url: string;
  altText: string;
  /** Which colourway this shot belongs to, so picking a colour can drive the gallery. */
  color: string;
  position: number;
}

export interface DemoReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  /** Age in days; resolved against the current clock at render time. */
  daysAgo: number;
}

export interface DemoProduct {
  id: string;
  name: string;
  slug: string;
  brandSlug: string;
  categorySlug: string;
  /** Only ACTIVE products are ever shown, or counted towards a category. */
  status: ProductStatus;
  targetGroup: TargetGroup;
  originalPriceMinor: number;
  outletPriceMinor: number;
  shortDescription: string;
  description: string;
  materials: string | null;
  careInstructions: string;
  countryOfOrigin: string;
  seoTitle: string;
  seoDescription: string;
  searchKeywords: string;
  createdAt: string;
  variants: DemoVariant[];
  images: DemoImage[];
  totalAvailable: number;
  /** Written reviews only — the ratings-only remainder lives in the aggregate. */
  reviews: DemoReview[];
  ratingAverage: number | null;
  reviewCount: number;
  ratingDistribution: Record<string, number>;
  verifiedReviewCount: number;
}

export interface DemoCampaign {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  coverImageUrl: string;
  startsInDays: number;
  endsInDays: number;
  position: number;
  extraDiscountPercent: number;
  /** productSlug -> campaign price in minor units */
  prices: Record<string, number>;
}

export const brandBySlug = new Map<string, DemoBrand>(BRANDS.map((b) => [b.slug, b] as const));

function toDemoReview(slug: string, review: GeneratedReview): DemoReview {
  return {
    id: `rev_${slug}_${review.key}`,
    rating: review.rating,
    title: review.title,
    body: review.body,
    authorName: review.authorName,
    isVerifiedPurchase: review.isVerifiedPurchase,
    helpfulCount: review.helpfulCount,
    daysAgo: review.daysAgo,
  };
}

function materialise(spec: CatalogProductSpec): DemoProduct {
  const brand = brandBySlug.get(spec.brand) ?? BRANDS[0];

  const variants: DemoVariant[] = [];
  let variantIndex = 0;
  for (const color of spec.colors) {
    for (const size of spec.sizes) {
      variants.push({
        id: `var_${skuFor(spec, color, size)}`,
        sku: skuFor(spec, color, size),
        size,
        color,
        position: variantIndex,
        onHandQuantity: quantityFor(spec.stock, variantIndex),
      });
      variantIndex += 1;
    }
  }

  // Each colourway ships a front, back and fabric-detail shot, so the gallery
  // and its zoom viewer have genuine content rather than one image per colour.
  // Colour order matters: the first colourway's views come first, which is what
  // the card thumbnail and the PDP's default selection show.
  //
  // A product an administrator created in this browser has no pre-generated
  // file behind it, so its shots are drawn inline instead.
  const images: DemoImage[] = spec.colors.flatMap((color, colorIndex) =>
    PRODUCT_VIEWS.map((view, viewIndex) => {
      const position = colorIndex * PRODUCT_VIEWS.length + viewIndex;
      const artwork = {
        shape: spec.shape,
        color,
        brandName: brand.name,
        productName: spec.name,
        view,
      };
      return {
        id: `img_${spec.slug}_${color.toLowerCase()}_${view}`,
        url: spec.isCustom
          ? productArtworkDataUri(artwork)
          : productImageUrl(spec.slug, color, view),
        altText: productArtworkAlt(spec.name, color, view),
        color,
        position,
      };
    }),
  );

  const generated = generateReviews({
    slug: spec.slug,
    kind: reviewKindForCategory(spec.category),
  });
  const aggregate = aggregateReviews(generated);

  return {
    id: `prod_${spec.slug}`,
    name: spec.name,
    slug: spec.slug,
    brandSlug: spec.brand,
    categorySlug: spec.category,
    status: spec.status,
    targetGroup: spec.targetGroup,
    originalPriceMinor: spec.originalPriceMinor,
    outletPriceMinor: spec.outletPriceMinor,
    shortDescription: spec.shortDescription,
    description: descriptionFor(spec),
    materials: spec.materials ?? null,
    careInstructions: spec.careInstructions ?? DEFAULT_CARE_INSTRUCTIONS,
    countryOfOrigin: spec.countryOfOrigin ?? DEFAULT_COUNTRY_OF_ORIGIN,
    seoTitle: `${spec.name} | Outlet`,
    seoDescription: spec.shortDescription,
    searchKeywords: `${brand.name} ${spec.name} outlet sale`,
    createdAt: spec.createdAt,
    variants,
    images,
    totalAvailable: variants.reduce((sum, v) => sum + v.onHandQuantity, 0),
    reviews: generated
      .filter((review) => review.body !== '')
      .map((review) => toDemoReview(spec.slug, review)),
    ratingAverage: aggregate.ratingAverage,
    reviewCount: aggregate.reviewCount,
    ratingDistribution: aggregate.distribution,
    verifiedReviewCount: aggregate.verifiedCount,
  };
}

/**
 * Expanding a product spec is not free — it generates reviews and, for
 * administrator-created rows, inline artwork — so the result is cached against
 * the catalogue overlay. `effectiveProducts()` hands back the same array until
 * something is actually written, which makes that a sound cache key and keeps
 * an edit in the admin panel visible on the very next read.
 */
let productCacheKey: CatalogProductSpec[] | null = null;
let productCache: DemoProduct[] = [];
let productIndex = new Map<string, DemoProduct>();

function refresh(): void {
  const specs = effectiveProducts();
  if (productCacheKey === specs) return;
  productCacheKey = specs;
  productCache = specs.map(materialise);
  productIndex = new Map(productCache.map((product) => [product.slug, product] as const));
}

/** Every product the shop holds, in every lifecycle state. */
export function allProducts(): DemoProduct[] {
  refresh();
  return productCache;
}

/**
 * Products a customer can see. Drafts, disabled and archived rows are excluded
 * here rather than at each call site, which is what stops one listing showing
 * a product another has already hidden.
 */
export function productList(): DemoProduct[] {
  return allProducts().filter((product) => product.status === 'ACTIVE');
}

export function productBySlug(slug: string): DemoProduct | undefined {
  refresh();
  const product = productIndex.get(slug);
  return product?.status === 'ACTIVE' ? product : undefined;
}

// --- Categories --------------------------------------------------------------

export type DemoCategoryNode = CategoryTreeNode & { isCustom: boolean };

/**
 * The category tree, counted against the products a customer can actually buy.
 *
 * This is the demo's stand-in for the API's CategoryTreeService, and it uses
 * the same builder — so "hidden beats empty", the roll-up of counts into
 * parents and the pruning rule are one implementation rather than two that
 * drift.
 */
export function categoryTree(): DemoCategoryNode[] {
  const rows = effectiveCategories();
  const counts: DirectCounts = {};
  for (const product of productList()) {
    counts[product.categorySlug] = (counts[product.categorySlug] ?? 0) + 1;
  }

  const custom = new Set(rows.filter((row) => row.isCustom).map((row) => row.slug));
  // The demo has no database, so the slug *is* the id — which also means a
  // category created in the admin panel keeps its identity across a reload.
  const asRows: CategoryRow[] = rows.map((row) => ({
    id: row.slug,
    slug: row.slug,
    name: row.name,
    pathSegment: row.pathSegment,
    parentId: row.parentSlug,
    targetGroup: row.targetGroup,
    level: row.level,
    position: row.position,
    isActive: row.isActive,
    sizeChartGroup: row.sizeChartGroup,
  }));

  const mark = (node: CategoryTreeNode): DemoCategoryNode => ({
    ...node,
    isCustom: custom.has(node.slug),
    children: node.children.map(mark),
  });
  return buildCategoryTree(asRows, counts).map(mark);
}

export const CAMPAIGN_LIST: DemoCampaign[] = CAMPAIGNS.map((spec) => {
  const prices: Record<string, number> = {};
  for (const slug of spec.productSlugs) {
    const product = productBySlug(slug);
    if (!product) continue;
    prices[slug] = Math.max(
      100,
      Math.round((product.outletPriceMinor * (100 - spec.extraDiscountPercent)) / 100),
    );
  }
  return {
    id: `camp_${spec.slug}`,
    title: spec.title,
    slug: spec.slug,
    shortDescription: spec.shortDescription,
    description: `${spec.shortDescription}\n\nCampaign prices apply only while the campaign is running and stocks last.`,
    coverImageUrl: campaignImageUrl(spec.slug),
    startsInDays: spec.startsInDays,
    endsInDays: spec.endsInDays,
    position: spec.position,
    extraDiscountPercent: spec.extraDiscountPercent,
    prices,
  };
});

export const campaignBySlug = new Map<string, DemoCampaign>(
  CAMPAIGN_LIST.map((c) => [c.slug, c] as const),
);
