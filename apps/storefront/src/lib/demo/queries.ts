/**
 * Query layer over the demo catalog. Mirrors the shapes and semantics of the
 * real API's public catalog/campaign endpoints (apps/api) so that every
 * storefront component keeps consuming the same @outlet/types DTOs.
 *
 * Campaign windows are resolved against the *current* clock on every call, so a
 * page rendered in the browser always shows a live active/upcoming split even
 * though the deployment itself is a static build.
 */

import type {
  BrandDto,
  CampaignDto,
  CategoryDto,
  Paginated,
  ProductDetailDto,
  ProductListItemDto,
} from '@outlet/types';
import {
  BRANDS,
  CAMPAIGN_LIST,
  CATEGORIES,
  CONTENT_PAGES,
  CURRENCY_CODE,
  PRODUCT_LIST,
  brandBySlug,
  campaignBySlug,
  categoryBySlug,
  productBySlug,
  type DemoCampaign,
  type DemoProduct,
  type DemoVariant,
} from './data';
import { consumedFor } from './store';

/** Seeded stock minus whatever paid demo orders have consumed. */
export function availableFor(variant: DemoVariant): number {
  return Math.max(0, variant.onHandQuantity - consumedFor(variant.id));
}

export function totalAvailableFor(product: DemoProduct): number {
  return product.variants.reduce((sum, variant) => sum + availableFor(variant), 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedCampaign extends DemoCampaign {
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  isUpcoming: boolean;
}

/** Anchor the relative campaign offsets to the clock at call time. */
function resolveCampaign(campaign: DemoCampaign, now: number): ResolvedCampaign {
  const startsAt = new Date(now + campaign.startsInDays * DAY_MS);
  const endsAt = new Date(now + campaign.endsInDays * DAY_MS);
  return {
    ...campaign,
    startsAt,
    endsAt,
    isActive: startsAt.getTime() <= now && endsAt.getTime() > now,
    isUpcoming: startsAt.getTime() > now,
  };
}

function resolvedCampaigns(now = Date.now()): ResolvedCampaign[] {
  return CAMPAIGN_LIST.map((c) => resolveCampaign(c, now)).sort((a, b) => a.position - b.position);
}

/**
 * Effective price for a product: the cheapest price offered by any campaign
 * currently running, otherwise the standard outlet price.
 */
function pricingFor(product: DemoProduct, now: number) {
  let best: { price: number; campaign: ResolvedCampaign } | null = null;
  for (const campaign of resolvedCampaigns(now)) {
    if (!campaign.isActive) continue;
    const price = campaign.prices[product.slug];
    if (price === undefined) continue;
    if (!best || price < best.price) best = { price, campaign };
  }
  const currentPriceMinor = best ? best.price : product.outletPriceMinor;
  return {
    currentPriceMinor,
    discountPercent: Math.round((1 - currentPriceMinor / product.originalPriceMinor) * 100),
    campaignId: best?.campaign.id ?? null,
    campaignSlug: best?.campaign.slug ?? null,
  };
}

function toListItem(product: DemoProduct, now: number): ProductListItemDto {
  const brand = brandBySlug.get(product.brandSlug)!;
  const category = categoryBySlug.get(product.categorySlug) ?? null;
  const pricing = pricingFor(product, now);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: { id: `brand_${brand.slug}`, name: brand.name, slug: brand.slug },
    category: category
      ? { id: `cat_${category.slug}`, name: category.name, slug: category.slug }
      : null,
    targetGroup: product.targetGroup,
    originalPriceMinor: product.originalPriceMinor,
    currentPriceMinor: pricing.currentPriceMinor,
    discountPercent: pricing.discountPercent,
    currencyCode: CURRENCY_CODE,
    imageUrl: product.images[0]?.url ?? null,
    campaignId: pricing.campaignId,
    campaignSlug: pricing.campaignSlug,
    totalAvailable: totalAvailableFor(product),
    createdAt: product.createdAt,
  };
}

// --- Catalog ---------------------------------------------------------------

export function listBrands(): BrandDto[] {
  return BRANDS.map((b) => ({
    id: `brand_${b.slug}`,
    name: b.name,
    slug: b.slug,
    description: `${b.name} outlet deals.`,
    logoUrl: null,
    isFeatured: b.isFeatured,
  }));
}

export function listCategories(): CategoryDto[] {
  const roots = CATEGORIES.filter((c) => c.parentSlug === null);
  return roots.map((c) => ({
    id: `cat_${c.slug}`,
    name: c.name,
    slug: c.slug,
    parentId: null,
    position: c.position,
    children: CATEGORIES.filter((child) => child.parentSlug === c.slug).map((child) => ({
      id: `cat_${child.slug}`,
      name: child.name,
      slug: child.slug,
      parentId: `cat_${c.slug}`,
      position: child.position,
    })),
  }));
}

/** A category filter matches the category itself and any of its children. */
function categorySlugsFor(slug: string): Set<string> {
  const slugs = new Set<string>([slug]);
  for (const category of CATEGORIES) {
    if (category.parentSlug === slug) slugs.add(category.slug);
  }
  return slugs;
}

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
  inStock?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}

export function listProducts(
  params: ListProductsParams = {},
  now = Date.now(),
): Paginated<ProductListItemDto> {
  let items = PRODUCT_LIST.map((product) => ({ product, dto: toListItem(product, now) }));

  if (params.q) {
    const needle = params.q.toLowerCase();
    items = items.filter(({ product }) => {
      const brand = brandBySlug.get(product.brandSlug)!;
      return (
        product.name.toLowerCase().includes(needle) ||
        brand.name.toLowerCase().includes(needle) ||
        product.searchKeywords.toLowerCase().includes(needle) ||
        product.shortDescription.toLowerCase().includes(needle)
      );
    });
  }

  if (params.category) {
    const allowed = categorySlugsFor(params.category);
    items = items.filter(({ product }) => allowed.has(product.categorySlug));
  }

  if (params.brand) {
    items = items.filter(({ product }) => product.brandSlug === params.brand);
  }

  if (params.size) {
    items = items.filter(({ product }) => product.variants.some((v) => v.size === params.size));
  }

  if (params.color) {
    items = items.filter(({ product }) => product.variants.some((v) => v.color === params.color));
  }

  if (params.targetGroup) {
    items = items.filter(({ product }) => product.targetGroup === params.targetGroup);
  }

  if (params.campaign) {
    const campaign = campaignBySlug.get(params.campaign);
    if (!campaign) {
      return { items: [], total: 0, page: 1, pageSize: 24, totalPages: 0 };
    }
    items = items.filter(({ product }) => product.slug in campaign.prices);
  }

  const minPrice = Number(params.minPrice);
  if (Number.isFinite(minPrice)) {
    items = items.filter(({ dto }) => dto.currentPriceMinor >= minPrice * 100);
  }
  const maxPrice = Number(params.maxPrice);
  if (Number.isFinite(maxPrice)) {
    items = items.filter(({ dto }) => dto.currentPriceMinor <= maxPrice * 100);
  }
  const minDiscount = Number(params.minDiscount);
  if (Number.isFinite(minDiscount)) {
    items = items.filter(({ dto }) => dto.discountPercent >= minDiscount);
  }

  if (params.inStock === 'true') {
    items = items.filter(({ dto }) => dto.totalAvailable > 0);
  }

  const sort = params.sort ?? 'recommended';
  items.sort((a, b) => {
    switch (sort) {
      case 'newest':
        return Date.parse(b.dto.createdAt) - Date.parse(a.dto.createdAt);
      case 'price_asc':
        return a.dto.currentPriceMinor - b.dto.currentPriceMinor;
      case 'price_desc':
        return b.dto.currentPriceMinor - a.dto.currentPriceMinor;
      case 'discount':
        return b.dto.discountPercent - a.dto.discountPercent;
      case 'popularity':
        // No order history in the demo build; approximate with stock depth.
        return b.dto.totalAvailable - a.dto.totalAvailable;
      case 'recommended':
      default:
        // In-stock and discounted first, then alphabetical for stability.
        if (a.dto.totalAvailable > 0 !== b.dto.totalAvailable > 0) {
          return a.dto.totalAvailable > 0 ? -1 : 1;
        }
        if (b.dto.discountPercent !== a.dto.discountPercent) {
          return b.dto.discountPercent - a.dto.discountPercent;
        }
        return a.dto.name.localeCompare(b.dto.name);
    }
  });

  const pageSize = Math.max(1, Math.min(96, Number(params.pageSize) || 24));
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.max(1, Math.min(totalPages || 1, Number(params.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize).map(({ dto }) => dto),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function getProduct(slug: string, now = Date.now()): ProductDetailDto | null {
  const product = productBySlug.get(slug);
  if (!product) return null;
  const base = toListItem(product, now);
  const pricing = pricingFor(product, now);

  return {
    ...base,
    shortDescription: product.shortDescription,
    description: product.description,
    materials: product.materials,
    careInstructions: product.careInstructions,
    countryOfOrigin: product.countryOfOrigin,
    status: 'ACTIVE',
    taxClass: 'STANDARD',
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.altText,
      position: image.position,
      variantId: null,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: null,
      size: variant.size,
      color: variant.color,
      priceMinor: pricing.currentPriceMinor,
      isEnabled: true,
      availableQuantity: availableFor(variant),
      attributes: null,
    })),
  };
}

export function productSlugs(): string[] {
  return PRODUCT_LIST.map((p) => p.slug);
}

// --- Campaigns -------------------------------------------------------------

function toCampaignDto(campaign: ResolvedCampaign): CampaignDto {
  return {
    id: campaign.id,
    title: campaign.title,
    slug: campaign.slug,
    shortDescription: campaign.shortDescription,
    description: campaign.description,
    coverImageUrl: campaign.coverImageUrl,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    status: campaign.isActive ? 'ACTIVE' : campaign.isUpcoming ? 'SCHEDULED' : 'ENDED',
    position: campaign.position,
    seoTitle: campaign.title,
    seoDescription: campaign.shortDescription,
    productCount: Object.keys(campaign.prices).length,
  };
}

export function listCampaigns(status?: string, now = Date.now()): CampaignDto[] {
  return resolvedCampaigns(now)
    .filter((campaign) => {
      if (status === 'active') return campaign.isActive;
      if (status === 'upcoming') return campaign.isUpcoming;
      return true;
    })
    .map(toCampaignDto);
}

export function getCampaign(
  slug: string,
  now = Date.now(),
): (CampaignDto & { products: ProductListItemDto[] }) | null {
  const base = campaignBySlug.get(slug);
  if (!base) return null;
  const campaign = resolveCampaign(base, now);
  const products = Object.keys(campaign.prices)
    .map((productSlug) => productBySlug.get(productSlug))
    .filter((p): p is DemoProduct => Boolean(p))
    .map((product) => {
      const dto = toListItem(product, now);
      // On an upcoming campaign's page, show what the price *will* be.
      if (campaign.isUpcoming) {
        const price = campaign.prices[product.slug];
        return {
          ...dto,
          currentPriceMinor: price,
          discountPercent: Math.round((1 - price / product.originalPriceMinor) * 100),
        };
      }
      return dto;
    });

  return { ...toCampaignDto(campaign), products };
}

export function campaignSlugs(): string[] {
  return CAMPAIGN_LIST.map((c) => c.slug);
}

// --- Content ---------------------------------------------------------------

export function getContentPage(key: string) {
  return CONTENT_PAGES.find((page) => page.key === key) ?? null;
}

export function contentPageKeys(): string[] {
  return CONTENT_PAGES.map((page) => page.key);
}
