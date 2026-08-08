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
import { api } from '@/lib/api';
import { CampaignCard } from './campaign-card';
import { ProductGrid } from './product-card';
import { Countdown } from './countdown';

type CampaignDetailDto = CampaignDto & { products: ProductListItemDto[] };

function CardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

export function CampaignSections({ limit }: { limit?: number }) {
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

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-xl font-bold">Active campaigns</h2>
        {active.isPending ? (
          <CardSkeleton />
        ) : cut(active.data).length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cut(active.data).map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No campaigns are running right now.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Upcoming campaigns</h2>
        {upcoming.isPending ? (
          <CardSkeleton />
        ) : cut(upcoming.data).length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cut(upcoming.data).map((c) => (
              <CampaignCard key={c.id} campaign={c} upcoming />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nothing scheduled yet — check back soon.</p>
        )}
      </section>
    </div>
  );
}

export function CampaignDetail({ slug }: { slug: string }) {
  const { data: campaign, isPending, isError } = useQuery({
    queryKey: ['campaign', slug],
    queryFn: () => api.get<CampaignDetailDto>(`/campaigns/${slug}`),
    retry: false,
  });

  if (isPending) {
    return (
      <div>
        <div className="mb-6 h-56 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <p className="py-16 text-center text-sm text-gray-500">
        This campaign could not be found.
      </p>
    );
  }

  const isUpcoming = new Date(campaign.startsAt) > new Date();

  return (
    <div>
      <div className="relative mb-6 overflow-hidden rounded-xl bg-gray-900">
        {campaign.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.coverImageUrl}
            alt={campaign.title}
            className="h-56 w-full object-cover opacity-70"
          />
        ) : (
          <div className="h-56" />
        )}
        <div className="absolute inset-0 flex flex-col justify-center px-8 text-white">
          <h1 className="text-3xl font-black">{campaign.title}</h1>
          {campaign.shortDescription ? (
            <p className="mt-1 max-w-lg text-gray-200">{campaign.shortDescription}</p>
          ) : null}
          <p className="mt-3 text-sm">
            {isUpcoming ? (
              <>Starts: {new Date(campaign.startsAt).toLocaleString()}</>
            ) : (
              <>
                Ends in <Countdown expiresAt={campaign.endsAt} className="text-white" />
              </>
            )}
          </p>
        </div>
      </div>

      {isUpcoming ? (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          This campaign has not started yet. Prices shown below are the campaign prices that will
          apply once it goes live.
        </p>
      ) : null}

      <div className="mt-6">
        <ProductGrid products={campaign.products} />
      </div>
    </div>
  );
}
