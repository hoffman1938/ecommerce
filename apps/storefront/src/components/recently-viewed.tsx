'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductDetailDto } from '@outlet/types';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { rememberViewedProduct, recentlyViewedSlugs } from '@/lib/hooks';
import { ProductGrid } from './product-card';
import { Section, SectionHeader } from './section';

/** Records a product view in localStorage and emits the analytics event. */
export function TrackProductView({
  slug,
  productId,
  brand,
  priceMinor,
}: {
  slug: string;
  productId: string;
  brand: string;
  priceMinor: number;
}) {
  // Guarded so one visit produces one event. StrictMode double-invokes effects
  // in development, and any remount would otherwise inflate view counts.
  const reportedSlug = useRef<string | null>(null);

  useEffect(() => {
    rememberViewedProduct(slug);
    if (reportedSlug.current === slug) return;
    reportedSlug.current = slug;
    track('product_view', { productId, slug, brand, priceMinor });
  }, [slug, productId, brand, priceMinor]);
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
