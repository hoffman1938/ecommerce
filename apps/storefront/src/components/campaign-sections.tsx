'use client';

/**
 * Campaign views render on the client.
 *
 * Campaign windows are relative to "now", so anything baked into a static
 * export would freeze the active/upcoming split at build time and eventually
 * show a finished sale as live. Fetching on the client keeps the split and the
 * countdowns honest no matter how long ago the site was built.
 */

import { useQuery } from '@tanstack/react-query';
import type { CampaignDto, ProductListItemDto } from '@outlet/types';
import { EmptyState, Skeleton } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { CampaignCard } from './campaign-card';
import { ProductGrid, ProductGridSkeleton } from './product-card';
import { Countdown } from './countdown';
import { Section, SectionHeader } from './section';

type CampaignDetailDto = CampaignDto & { products: ProductListItemDto[] };

const CAMPAIGN_GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5';

function CampaignGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={CAMPAIGN_GRID} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[16/10] w-full sm:aspect-[3/2] lg:aspect-[16/10]" />
      ))}
    </div>
  );
}

export function CampaignSections({ limit }: { limit?: number }) {
  const { t } = useI18n();
  const active = useQuery({
    queryKey: ['campaigns', 'active'],
    queryFn: () => api.get<CampaignDto[]>('/campaigns?status=active'),
  });
  const upcoming = useQuery({
    queryKey: ['campaigns', 'upcoming'],
    queryFn: () => api.get<CampaignDto[]>('/campaigns?status=upcoming'),
  });

  const cut = (list: CampaignDto[] | undefined) =>
    limit ? (list ?? []).slice(0, limit) : (list ?? []);

  const activeItems = cut(active.data);
  const upcomingItems = cut(upcoming.data);

  return (
    <>
      <Section>
        <SectionHeader
          title={t('campaign.liveTitle')}
          description={t('campaign.liveDesc')}
          action={limit ? { href: '/campaigns', label: t('campaign.allCampaigns') } : undefined}
        />
        {active.isPending ? (
          <CampaignGridSkeleton count={limit ?? 3} />
        ) : activeItems.length > 0 ? (
          <div className={CAMPAIGN_GRID}>
            {activeItems.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        ) : (
          <p className="border-t border-line py-10 text-center lg:py-12 text-sm text-ink-500">
            {t('campaign.noneActive')}
          </p>
        )}
      </Section>

      <Section>
        <SectionHeader title={t('campaign.comingSoon')} />
        {upcoming.isPending ? (
          <CampaignGridSkeleton count={limit ?? 2} />
        ) : upcomingItems.length > 0 ? (
          <div className={CAMPAIGN_GRID}>
            {upcomingItems.map((c) => (
              <CampaignCard key={c.id} campaign={c} upcoming />
            ))}
          </div>
        ) : (
          <p className="border-t border-line py-10 text-center lg:py-12 text-sm text-ink-500">
            {t('campaign.noneUpcoming')}
          </p>
        )}
      </Section>
    </>
  );
}

export function CampaignDetail({ slug }: { slug: string }) {
  const { t, formatDate } = useI18n();
  const {
    data: campaign,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['campaign', slug],
    queryFn: () => api.get<CampaignDetailDto>(`/campaigns/${slug}`),
    retry: false,
  });

  if (isPending) {
    return (
      <div className="container-page py-5 lg:py-8">
        <Skeleton className="h-56 w-full rounded lg:h-72" />
        <Skeleton className="mt-8 h-6 w-40" />
        <div className="mt-6">
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="container-page">
        <EmptyState title={t('campaign.notFound')} description={t('campaign.notFoundDesc')} />
      </div>
    );
  }

  const isUpcoming = new Date(campaign.startsAt) > new Date();

  return (
    <div className="container-page py-5 lg:py-8">
      {/* Fixed scrim colours: the copy over this artwork is white in both
          themes, so the gradient beneath it must stay dark in both. */}
      <div className="relative overflow-hidden rounded bg-scrim-900 dark:rounded-lg dark:ring-1 dark:ring-inset dark:ring-line">
        <div className="relative aspect-[16/9] sm:aspect-[21/8] lg:aspect-[3/1]">
          {campaign.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div
            className="absolute inset-0 bg-gradient-to-t from-scrim-950/90 via-scrim-950/45 to-scrim-950/10 dark:from-scrim-950/92 dark:via-scrim-950/55 dark:to-scrim-950/20"
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 lg:p-9">
            <p className="text-2xs font-bold uppercase tracking-[0.09em] text-white/70">
              {isUpcoming ? t('campaign.upcomingLabel') : t('campaign.liveLabel')}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[0.96] tracking-[-0.038em] text-white sm:text-5xl lg:text-7xl">
              {campaign.title}
            </h1>
            {campaign.shortDescription ? (
              <p className="mt-2 max-w-xl text-sm text-white/80 sm:text-base">
                {campaign.shortDescription}
              </p>
            ) : null}
            <p className="mt-4 text-sm text-white/85">
              {isUpcoming ? (
                <>{t('campaign.opens', { date: formatDate(campaign.startsAt) })}</>
              ) : (
                <>
                  {t('campaign.endsIn')} <Countdown expiresAt={campaign.endsAt} tone="inverse" />
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {isUpcoming ? (
        <p className="mt-6 border-l-2 border-ink-950 bg-ink-25 px-4 py-3 text-sm text-ink-700 dark:rounded-r dark:border-l-ink-700 dark:bg-surface-card dark:text-content-secondary">
          {t('campaign.upcomingNote')}
        </p>
      ) : null}

      <Section className="mt-8 lg:mt-10">
        <SectionHeader
          title={isUpcoming ? t('campaign.willInclude') : t('campaign.inCampaign')}
          description={t('product.productCount', { count: campaign.products.length })}
        />
        <ProductGrid products={campaign.products} priorityCount={4} />
      </Section>
    </div>
  );
}
