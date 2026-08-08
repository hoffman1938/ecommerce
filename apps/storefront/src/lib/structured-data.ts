/**
 * schema.org JSON-LD builders.
 *
 * Product markup is what earns price, availability and star ratings in search
 * results, so it is generated from the same DTOs the page renders — never
 * hand-maintained alongside them, which is how structured data goes stale and
 * starts contradicting the visible page.
 */

import type { ProductDetailDto } from '@outlet/types';

/** Public origin, used for absolute URLs in structured data and canonicals. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ecommerce-135.pages.dev'
).replace(/\/$/, '');

export const SITE_NAME = 'Outlet Marketplace';

function absolute(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Inline data URIs are valid images for the page but useless to a crawler, so
 * they are omitted rather than emitted as multi-kilobyte JSON-LD strings.
 */
function crawlableImages(urls: Array<string | null>): string[] {
  return urls.filter((url): url is string => Boolean(url) && !url!.startsWith('data:'));
}

export function productJsonLd(product: ProductDetailDto): Record<string, unknown> {
  const inStock = product.totalAvailable > 0;
  const images = crawlableImages(product.images.map((image) => image.url));

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: product.brand.name },
    url: absolute(`/products/${product.slug}`),
    offers: {
      '@type': 'Offer',
      url: absolute(`/products/${product.slug}`),
      priceCurrency: product.currencyCode,
      // schema.org wants a decimal string, not minor units.
      price: (product.currentPriceMinor / 100).toFixed(2),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
    },
  };

  if (images.length > 0) jsonLd.image = images;
  if (product.materials) jsonLd.material = product.materials;
  if (product.category) jsonLd.category = product.category.name;

  // Only claim an aggregate rating when there is one — inventing it is exactly
  // the kind of thing that gets structured data penalised.
  if (product.ratingAverage !== null && product.reviewCount > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.ratingAverage.toFixed(1),
      reviewCount: product.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return jsonLd;
}

export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Limited-stock outlet deals on brand clothing, footwear and accessories.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
