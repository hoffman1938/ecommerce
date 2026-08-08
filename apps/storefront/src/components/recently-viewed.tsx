'use client';

import { useEffect, useState } from 'react';
import type { ProductDetailDto } from '@outlet/types';
import { api } from '@/lib/api';
import { rememberViewedProduct, recentlyViewedSlugs } from '@/lib/hooks';
import { ProductGrid } from './product-card';
import { Section, SectionHeader } from './section';

/** Records a product view in localStorage (client-side only). */
export function TrackProductView({ slug }: { slug: string }) {
  useEffect(() => {
    rememberViewedProduct(slug);
  }, [slug]);
  return null;
}

export function RecentlyViewed({ excludeSlug }: { excludeSlug?: string }) {
  const [products, setProducts] = useState<ProductDetailDto[]>([]);

  useEffect(() => {
    const slugs = recentlyViewedSlugs()
      .filter((s) => s !== excludeSlug)
      .slice(0, 4);
    if (slugs.length === 0) return;
    Promise.all(
      slugs.map((slug) => api.get<ProductDetailDto>(`/catalog/products/${slug}`).catch(() => null)),
    ).then((results) => setProducts(results.filter((p): p is ProductDetailDto => Boolean(p))));
  }, [excludeSlug]);

  if (products.length === 0) return null;

  return (
    <Section>
      <SectionHeader title="Recently viewed" />
      {/* Reuses the catalog tile so a product looks identical wherever it
          appears, rather than having a second, smaller card style. */}
      <ProductGrid products={products} />
    </Section>
  );
}
