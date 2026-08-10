'use client';

import { EmptyState } from '@outlet/ui';
import { audienceBySlug } from '@/lib/audience';
import { useI18n } from '@/lib/i18n';
import { ProductListing } from './product-listing';

/**
 * A Men / Women / Kids / Unisex listing.
 *
 * Thin on purpose: an audience is a fixed `targetGroup` filter over the same
 * listing every other page uses, so facets, sorting, pagination and the empty
 * state all behave identically. Only the title and the recommendation scope
 * differ, and both are derived from the slug.
 *
 * A client component because the heading has to be translated, and translation
 * lives in a context the statically exported page cannot read at build time.
 */
export function AudienceListing({ slug }: { slug: string }) {
  const { t } = useI18n();
  const audience = audienceBySlug(slug);

  if (!audience) {
    return (
      <div className="container-page">
        <EmptyState title={t('audience.notFound')} description={t('audience.notFoundDesc')} />
      </div>
    );
  }

  return (
    <ProductListing
      title={t(`audience.${audience.key}`)}
      fixedFilters={{ targetGroup: audience.group }}
      basePath={`/shop/${audience.slug}`}
      audience={audience.group}
    />
  );
}
