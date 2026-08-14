'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ProductDetailDto, ProductListItemDto } from '@outlet/types';
import { EmptyState } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ProductDetail } from '@/components/product-detail';

/**
 * A product page resolved in the browser.
 *
 * The static export only has HTML for the products that existed when it was
 * built, so anything an administrator adds afterwards has no file and lands on
 * not-found. This fetches it and renders the same component the real route
 * does, which is why a newly created product is reachable at its own URL
 * rather than 404ing until the next deploy.
 *
 * A slug that genuinely does not exist still reports not found — the fallback
 * is a second lookup, not a way to make every URL resolve.
 */
export function ProductDetailRemote({ slug }: { slug: string }) {
  const { t } = useI18n();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product-fallback', slug],
    queryFn: async () => {
      const product = await api.get<ProductDetailDto>(`/catalog/products/${slug}`);
      // Related products are a nicety; a failure there must not lose the page.
      const related = await api
        .get<ProductListItemDto[]>(`/catalog/products/${slug}/related?limit=4`)
        .catch(() => []);
      return { product, related };
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="container-page py-20 text-center text-sm text-ink-500">{t('ui.loading')}</div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container-page py-20">
        <EmptyState
          title={t('common.notFoundTitle')}
          description={t('common.notFoundDesc')}
          action={
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
            >
              {t('common.backHome')}
            </Link>
          }
        />
      </div>
    );
  }

  return <ProductDetail product={data.product} related={data.related} />;
}
