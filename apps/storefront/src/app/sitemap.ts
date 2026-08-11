import type { MetadataRoute } from 'next';
import type { CategoryDto } from '@outlet/types';
import { SITE_URL } from '@/lib/structured-data';
import { campaignSlugs, contentPageKeys, listCategories, productSlugs } from '@/lib/demo/queries';
import { BRANDS } from '@outlet/catalog';

/**
 * Static sitemap, generated at build time from the catalogue.
 *
 * Note that public/robots.txt currently disallows everything: this deployment
 * shows placeholder data under real brand names and must not be indexed. The
 * sitemap is still generated so that relaxing robots.txt is the only change
 * needed once the catalogue holds real inventory.
 */
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPaths = ['', '/products', '/campaigns', '/search', '/wishlist'];

  // Every level of the tree, addressed by its readable path. Hidden and empty
  // branches are already gone — `listCategories` returns only what a customer
  // can reach, so the sitemap cannot advertise a page that 404s.
  const walk = (nodes: CategoryDto[]): string[] =>
    nodes.flatMap((node) => [node.href, ...walk(node.children)]);
  const categoryPaths = walk(listCategories());

  return [
    ...staticPaths.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: path === '' ? 1 : 0.8,
    })),
    ...categoryPaths.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...BRANDS.map((brand) => ({
      url: `${SITE_URL}/brand/${brand.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...campaignSlugs().map((slug) => ({
      url: `${SITE_URL}/campaigns/${slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...productSlugs().map((slug) => ({
      url: `${SITE_URL}/products/${slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),
    ...contentPageKeys().map((key) => ({
      url: `${SITE_URL}/pages/${key}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
