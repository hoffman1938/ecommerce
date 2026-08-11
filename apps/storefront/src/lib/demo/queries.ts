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
  ProductReviewsDto,
  ReviewDto,
  SearchSuggestionsDto,
  TargetGroup,
} from '@outlet/types';
import { flattenTree, pruneToVisible, resolvePath, subtreeIds } from '@outlet/catalog';
import {
  BRANDS,
  CAMPAIGN_LIST,
  CONTENT_PAGES,
  CURRENCY_CODE,
  brandBySlug,
  campaignBySlug,
  categoryTree,
  productBySlug,
  productList,
  type DemoCampaign,
  type DemoCategoryNode,
  type DemoProduct,
  brandImageUrl,
  categoryImageUrl,
  type DemoVariant,
} from './data';
import { consumedFor, simNow } from './store';

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

function resolvedCampaigns(now = simNow()): ResolvedCampaign[] {
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

/** Flat lookup over the whole tree, hidden rows included. */
function categoryIndex(): Map<string, DemoCategoryNode> {
  return new Map(
    (flattenTree(categoryTree()) as DemoCategoryNode[]).map((node) => [node.slug, node] as const),
  );
}

function toListItem(product: DemoProduct, now: number): ProductListItemDto {
  const brand = brandBySlug.get(product.brandSlug)!;
  const category = categoryIndex().get(product.categorySlug) ?? null;
  const pricing = pricingFor(product, now);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: { id: `brand_${brand.slug}`, name: brand.name, slug: brand.slug },
    category: category ? { id: category.slug, name: category.name, slug: category.slug } : null,
    targetGroup: product.targetGroup,
    originalPriceMinor: product.originalPriceMinor,
    currentPriceMinor: pricing.currentPriceMinor,
    discountPercent: pricing.discountPercent,
    currencyCode: CURRENCY_CODE,
    imageUrl: product.images[0]?.url ?? null,
    // The hover shot is the next view of the *same* colourway where one exists,
    // so hovering shows the garment from the back rather than in another colour.
    hoverImageUrl: product.images[1]?.url ?? null,
    colors: [...new Set(product.variants.map((v) => v.color))],
    campaignId: pricing.campaignId,
    campaignSlug: pricing.campaignSlug,
    totalAvailable: totalAvailableFor(product),
    ratingAverage: product.ratingAverage,
    reviewCount: product.reviewCount,
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
    imageUrl: brandImageUrl(b.slug),
    isFeatured: b.isFeatured,
  }));
}

export function getBrand(slug: string): BrandDto | null {
  return listBrands().find((brand) => brand.slug === slug) ?? null;
}

function toCategoryDto(node: DemoCategoryNode): CategoryDto {
  return {
    id: node.slug,
    name: node.name,
    slug: node.slug,
    parentId: node.parentId,
    position: node.position,
    pathSegment: node.pathSegment,
    path: node.path,
    href: node.href,
    targetGroup: node.targetGroup,
    level: node.level,
    sizeChartGroup: node.sizeChartGroup,
    productCount: node.productCount,
    imageUrl: categoryImageUrl(node.slug, node.name, node.isCustom),
    children: (node.children as DemoCategoryNode[]).map(toCategoryDto),
  };
}

/**
 * The customer-facing tree: hidden branches and branches with nothing to sell
 * are already gone, so the header, the tiles and the sitemap all agree about
 * what the shop currently sells without each applying the rule themselves.
 */
export function listCategories(): CategoryDto[] {
  return (pruneToVisible(categoryTree()) as DemoCategoryNode[]).map(toCategoryDto);
}

/** Flat lookup including hidden rows, for page headers and product cards. */
export function getCategory(slug: string): CategoryDto | null {
  const node = (flattenTree(categoryTree()) as DemoCategoryNode[]).find((n) => n.slug === slug);
  return node ? toCategoryDto(node) : null;
}

/**
 * Resolves `women/clothing/dresses` to its breadcrumb trail, or null when the
 * path does not exist or is not currently visible — to a customer those are
 * the same thing.
 */
export function resolveCategoryPath(segments: string[]): CategoryDto[] | null {
  if (segments.length === 0) return null;
  const trail = resolvePath(pruneToVisible(categoryTree()), segments) as DemoCategoryNode[];
  if (trail.length !== segments.length) return null;
  return trail.map(toCategoryDto);
}

/** A category filter matches the category itself and everything beneath it. */
function categorySlugsFor(slug: string): Set<string> {
  const match = flattenTree(categoryTree()).find((node) => node.slug === slug);
  return new Set(match ? subtreeIds(match) : [slug]);
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
  minRating?: string;
  inStock?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}

export function listProducts(
  params: ListProductsParams = {},
  now = simNow(),
): Paginated<ProductListItemDto> {
  let items = productList().map((product) => ({ product, dto: toListItem(product, now) }));

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
  const minRating = Number(params.minRating);
  if (Number.isFinite(minRating)) {
    items = items.filter(({ dto }) => (dto.ratingAverage ?? 0) >= minRating);
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
      case 'rating': {
        // Unreviewed products sort last rather than tying with 1-star ones.
        const ratingDelta = (b.dto.ratingAverage ?? -1) - (a.dto.ratingAverage ?? -1);
        if (ratingDelta !== 0) return ratingDelta;
        return b.dto.reviewCount - a.dto.reviewCount;
      }
      case 'popularity':
        // No order history in the demo build; review volume is the closest
        // honest proxy for how much attention a product has had.
        return b.dto.reviewCount - a.dto.reviewCount;
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

export function getProduct(slug: string, now = simNow()): ProductDetailDto | null {
  const product = productBySlug(slug);
  if (!product) return null;
  const base = toListItem(product, now);
  const pricing = pricingFor(product, now);

  return {
    ...base,
    sizeChartGroup: categoryIndex().get(product.categorySlug)?.sizeChartGroup ?? null,
    shortDescription: product.shortDescription,
    description: product.description,
    materials: product.materials,
    careInstructions: product.careInstructions,
    countryOfOrigin: product.countryOfOrigin,
    status: 'ACTIVE',
    taxClass: 'STANDARD',
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    // Each shot is attached to a variant of its own colourway, which is how the
    // gallery knows to swap when a colour is picked. Any variant of the colour
    // will do — they share the same imagery.
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.altText,
      position: image.position,
      variantId: product.variants.find((v) => v.color === image.color)?.id ?? null,
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
  return productList().map((p) => p.slug);
}

// --- Reviews ---------------------------------------------------------------

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Published reviews for a product. Only written reviews are returned; the
 * ratings-only remainder is reflected in `reviewCount` and the distribution,
 * which is exactly how the API behaves.
 */
export function getProductReviews(
  slug: string,
  params: { sort?: string; page?: string; pageSize?: string } = {},
  now = simNow(),
): ProductReviewsDto | null {
  const product = productBySlug(slug);
  if (!product) return null;

  const items: ReviewDto[] = product.reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    authorName: review.authorName,
    isVerifiedPurchase: review.isVerifiedPurchase,
    helpfulCount: review.helpfulCount,
    createdAt: new Date(now - review.daysAgo * DAY_IN_MS).toISOString(),
    // Shop replies are authored in the admin panel against the real API; the
    // static demo catalogue carries none.
    adminReply: null,
    adminReplyAt: null,
  }));

  switch (params.sort) {
    case 'highest':
      items.sort((a, b) => b.rating - a.rating);
      break;
    case 'lowest':
      items.sort((a, b) => a.rating - b.rating);
      break;
    case 'helpful':
      items.sort((a, b) => b.helpfulCount - a.helpfulCount);
      break;
    case 'recent':
    default:
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      break;
  }

  const pageSize = Math.max(1, Math.min(50, Number(params.pageSize) || 5));
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.max(1, Math.min(totalPages || 1, Number(params.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
    ratingAverage: product.ratingAverage,
    reviewCount: product.reviewCount,
    distribution: product.ratingDistribution,
    verifiedCount: product.verifiedReviewCount,
  };
}

// --- Recommendations -------------------------------------------------------

/**
 * Deterministic "you may also like" — same category first, then same brand,
 * then whatever else is in stock, scored so closer matches win. No ML, no
 * randomness: the same product always recommends the same neighbours.
 */
export function relatedProducts(slug: string, limit = 4, now = simNow()): ProductListItemDto[] {
  const source = productBySlug(slug);
  if (!source) return [];

  const sourcePrice = source.outletPriceMinor;
  return productList()
    .filter((candidate) => candidate.slug !== slug)
    .map((candidate) => {
      let score = 0;
      if (candidate.categorySlug === source.categorySlug) score += 100;
      if (candidate.brandSlug === source.brandSlug) score += 60;
      if (candidate.targetGroup === source.targetGroup) score += 20;
      // Prefer a comparable price point — within 40% either way.
      const ratio = candidate.outletPriceMinor / sourcePrice;
      if (ratio >= 0.6 && ratio <= 1.4) score += 25;
      if (totalAvailableFor(candidate) > 0) score += 15;
      score += Math.round((candidate.ratingAverage ?? 0) * 2);
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map(({ candidate }) => toListItem(candidate, now));
}

/**
 * Recommendations from browsing signals. Used for "Picked for you" and for the
 * empty-cart and no-results states, where showing something beats showing
 * nothing. Falls back to best-rated in-stock products for a cold visitor.
 */
export function recommendedProducts(
  signals: {
    recentSlugs?: string[];
    wishlistSlugs?: string[];
    cartSlugs?: string[];
    /**
     * Restricts the pool to one audience. Menswear must never be suggested
     * under a women's listing, and nothing adult-sized belongs beneath a kids'
     * product — so this is a hard filter on the candidate set, not a scoring
     * nudge. `UNISEX` stock is admissible alongside MEN and WOMEN, because
     * that is what unisex means; KIDS is kept deliberately separate.
     */
    audience?: TargetGroup;
  } = {},
  limit = 4,
  now = simNow(),
): ProductListItemDto[] {
  const seen = new Set([
    ...(signals.recentSlugs ?? []),
    ...(signals.wishlistSlugs ?? []),
    ...(signals.cartSlugs ?? []),
  ]);

  const audience = signals.audience;
  const inAudience = (p: DemoProduct): boolean => {
    if (!audience) return true;
    if (audience === 'KIDS') return p.targetGroup === 'KIDS';
    if (audience === 'UNISEX') return p.targetGroup === 'UNISEX';
    return p.targetGroup === audience || p.targetGroup === 'UNISEX';
  };

  const pool = productList().filter((p) => inAudience(p) && totalAvailableFor(p) > 0);

  const sources = [...seen]
    .map((s) => productBySlug(s))
    .filter((p): p is DemoProduct => Boolean(p))
    .filter(inAudience);

  // No usable signal — or none inside this audience — so fall back to what is
  // simply doing well: best rated, then deepest reduction.
  if (sources.length === 0) {
    return pool
      .map((product) => ({ product, dto: toListItem(product, now) }))
      .sort(
        (a, b) =>
          (b.dto.ratingAverage ?? 0) - (a.dto.ratingAverage ?? 0) ||
          b.dto.discountPercent - a.dto.discountPercent,
      )
      .slice(0, limit)
      .map(({ dto }) => dto);
  }

  const categories = new Set(sources.map((p) => p.categorySlug));
  const brands = new Set(sources.map((p) => p.brandSlug));
  const averagePrice =
    sources.reduce((sum, p) => sum + p.outletPriceMinor, 0) / Math.max(1, sources.length);

  return pool
    .filter((p) => !seen.has(p.slug))
    .map((candidate) => {
      let score = 0;
      if (categories.has(candidate.categorySlug)) score += 80;
      if (brands.has(candidate.brandSlug)) score += 50;
      const ratio = candidate.outletPriceMinor / averagePrice;
      if (ratio >= 0.6 && ratio <= 1.4) score += 30;
      score += Math.round((candidate.ratingAverage ?? 0) * 4);
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map(({ candidate }) => toListItem(candidate, now));
}

// --- Search suggestions ----------------------------------------------------

/** Prefix-and-substring matching over names, brands, categories and SKUs. */
export function searchSuggestions(query: string, now = simNow()): SearchSuggestionsDto {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return { products: [], brands: [], categories: [] };

  const scored = productList()
    .map((product) => {
      const brand = brandBySlug.get(product.brandSlug)!;
      const name = product.name.toLowerCase();
      let score = 0;
      if (name.startsWith(needle)) score = 100;
      else if (name.includes(needle)) score = 70;
      else if (brand.name.toLowerCase().includes(needle)) score = 50;
      else if (product.categorySlug.includes(needle)) score = 40;
      else if (product.searchKeywords.toLowerCase().includes(needle)) score = 30;
      else if (product.variants.some((v) => v.sku.toLowerCase().includes(needle))) score = 90;
      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, 6);

  return {
    products: scored.map(({ product }) => {
      const dto = toListItem(product, now);
      return {
        name: dto.name,
        slug: dto.slug,
        imageUrl: dto.imageUrl,
        currentPriceMinor: dto.currentPriceMinor,
      };
    }),
    brands: BRANDS.filter((b) => b.name.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((b) => ({ name: b.name, slug: b.slug })),
    // Suggestions come from the visible tree, so a hidden or empty category
    // cannot be typed back into existence. "Boots" exists under four
    // departments, so the department is part of the label or the shopper
    // cannot tell the three suggestions apart.
    categories: (() => {
      const visible = pruneToVisible(categoryTree()) as DemoCategoryNode[];
      const departmentName = (node: DemoCategoryNode) =>
        visible.find((root) => root.targetGroup === node.targetGroup)?.name ?? '';
      return (flattenTree(visible) as DemoCategoryNode[])
        .filter((node) => node.name.toLowerCase().includes(needle) || node.slug.includes(needle))
        .sort((a, b) => b.path.length - a.path.length || b.productCount - a.productCount)
        .slice(0, 3)
        .map((node) => ({
          name: node.path.length > 1 ? `${departmentName(node)} · ${node.name}` : node.name,
          slug: node.slug,
        }));
    })(),
  };
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

export function listCampaigns(status?: string, now = simNow()): CampaignDto[] {
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
  now = simNow(),
): (CampaignDto & { products: ProductListItemDto[] }) | null {
  const base = campaignBySlug.get(slug);
  if (!base) return null;
  const campaign = resolveCampaign(base, now);
  const products = Object.keys(campaign.prices)
    .map((productSlug) => productBySlug(productSlug))
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
