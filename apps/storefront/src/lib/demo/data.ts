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
  CATALOG_EPOCH,
  CATEGORIES,
  CONTENT_PAGES,
  CURRENCY_CODE,
  DEFAULT_CARE_INSTRUCTIONS,
  DEFAULT_COUNTRY_OF_ORIGIN,
  PRODUCTS,
  SETTINGS,
  campaignArtworkDataUri,
  descriptionFor,
  productArtworkDataUri,
  quantityFor,
  skuFor,
  type BrandSpec,
  type CategorySpec,
} from '@outlet/catalog';
import {
  aggregateReviews,
  generateReviews,
  reviewKindForCategory,
  type GeneratedReview,
} from '@outlet/domain';
import type { TargetGroup } from '@outlet/types';

export { CONTENT_PAGES, CURRENCY_CODE, SETTINGS };
export type DemoBrand = BrandSpec;
export type DemoCategory = CategorySpec;
export { BRANDS, CATEGORIES };

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
export const categoryBySlug = new Map<string, DemoCategory>(
  CATEGORIES.map((c) => [c.slug, c] as const),
);

const CREATED_BASE = Date.parse(CATALOG_EPOCH);

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

export const PRODUCT_LIST: DemoProduct[] = PRODUCTS.map((spec, productIndex) => {
  const brand = brandBySlug.get(spec.brand)!;

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

  const images: DemoImage[] = spec.colors.map((color, position) => ({
    id: `img_${spec.slug}_${position}`,
    url: productArtworkDataUri({
      shape: spec.shape,
      color,
      brandName: brand.name,
      productName: spec.name,
    }),
    altText: `${spec.name} in ${color}`,
    position,
  }));

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
    // Stagger createdAt so "newest" sorting is stable and meaningful.
    createdAt: new Date(CREATED_BASE + productIndex * 3_600_000).toISOString(),
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
});

export const productBySlug = new Map<string, DemoProduct>(
  PRODUCT_LIST.map((p) => [p.slug, p] as const),
);

export const CAMPAIGN_LIST: DemoCampaign[] = CAMPAIGNS.map((spec) => {
  const prices: Record<string, number> = {};
  for (const slug of spec.productSlugs) {
    const product = productBySlug.get(slug);
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
    coverImageUrl: campaignArtworkDataUri(spec.title),
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
