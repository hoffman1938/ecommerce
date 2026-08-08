'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProductListItemDto } from '@outlet/types';
import { api } from '@/lib/api';
import { recentlyViewedSlugs } from '@/lib/hooks';
import { ProductGrid, ProductGridSkeleton } from '@/components/product-card';
import { Section, SectionHeader } from '@/components/section';

/**
 * "Picked for you" — recommendations derived from what this browser has looked
 * at. Used wherever the customer would otherwise hit a dead end: an empty bag,
 * a search with no results, an empty wishlist.
 *
 * Signals stay client-side and are sent per request rather than stored against
 * an account, so this works signed-out and leaves no profile behind.
 */
export function Recommendations({
  title = 'Picked for you',
  description,
  limit = 4,
  excludeSlugs = [],
}: {
  title?: string;
  description?: string;
  limit?: number;
  excludeSlugs?: string[];
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['recommendations', limit, excludeSlugs.join(',')],
    queryFn: () => {
      const recent = recentlyViewedSlugs().slice(0, 8);
      const params = new URLSearchParams({ limit: String(limit + excludeSlugs.length) });
      if (recent.length > 0) params.set('recent', recent.join(','));
      return api.get<ProductListItemDto[]>(`/catalog/recommended?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Section>
        <SectionHeader title={title} description={description} />
        <ProductGridSkeleton count={limit} />
      </Section>
    );
  }

  const products = (data ?? []).filter((p) => !excludeSlugs.includes(p.slug)).slice(0, limit);
  if (products.length === 0) return null;

  return (
    <Section className="reveal">
      <SectionHeader title={title} description={description} />
      <ProductGrid products={products} />
    </Section>
  );
}
