'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProductListItemDto, TargetGroup } from '@outlet/types';
import { api } from '@/lib/api';
import { recentlyViewedSlugs } from '@/lib/hooks';
import { ProductGrid, ProductGridSkeleton } from '@/components/product-card';
import { Section, SectionHeader } from '@/components/section';
import { useI18n } from '@/lib/i18n';

/**
 * "Picked for you" — recommendations derived from what this browser has looked
 * at. Used wherever the customer would otherwise hit a dead end: an empty bag,
 * a search with no results, an empty wishlist.
 *
 * Signals stay client-side and are sent per request rather than stored against
 * an account, so this works signed-out and leaves no profile behind.
 *
 * `audience` narrows the pool to one target group. Suggesting menswear under a
 * women's listing — or anything adult-sized beneath a kids' product — is worse
 * than suggesting nothing, so callers on an audience-scoped page pass theirs
 * down and the server treats it as a hard filter.
 *
 * Note the single `className` shared by both branches. The loading placeholder
 * and the loaded grid render the same element in the same position, so React
 * reconciles them by mutating attributes in place; letting `reveal` appear only
 * on the second render meant the class arrived without any node being inserted,
 * which is invisible to a childList MutationObserver. The section was then
 * never registered for the reveal animation and stayed at `opacity: 0`. Keeping
 * the class constant removes the flip; `useReveal` also watches attributes now,
 * so neither half of the fix depends on the other.
 */
export function Recommendations({
  title,
  description,
  limit = 4,
  excludeSlugs = [],
  audience,
}: {
  title?: string;
  description?: string;
  limit?: number;
  excludeSlugs?: string[];
  audience?: TargetGroup;
}) {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ['recommendations', limit, excludeSlugs.join(','), audience ?? 'all'],
    queryFn: () => {
      const recent = recentlyViewedSlugs().slice(0, 8);
      const params = new URLSearchParams({ limit: String(limit + excludeSlugs.length) });
      if (recent.length > 0) params.set('recent', recent.join(','));
      if (audience) params.set('audience', audience);
      return api.get<ProductListItemDto[]>(`/catalog/recommended?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  const heading = title ?? t('product.pickedForYou');
  const blurb = description ?? t('product.pickedForYouDesc');

  if (isLoading) {
    return (
      <Section className="reveal">
        <SectionHeader title={heading} description={blurb} />
        <ProductGridSkeleton count={limit} />
      </Section>
    );
  }

  const products = (data ?? []).filter((p) => !excludeSlugs.includes(p.slug)).slice(0, limit);
  if (products.length === 0) return null;

  return (
    <Section className="reveal">
      <SectionHeader title={heading} description={blurb} />
      <ProductGrid products={products} />
    </Section>
  );
}
