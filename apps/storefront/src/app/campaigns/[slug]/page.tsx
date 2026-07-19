import { notFound } from 'next/navigation';
import type { CampaignDto, ProductListItemDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from '@/components/product-card';
import { Countdown } from '@/components/countdown';

export const dynamic = 'force-dynamic';

type CampaignDetail = CampaignDto & { products: ProductListItemDto[] };

export default async function CampaignDetailPage({ params }: { params: { slug: string } }) {
  const campaign = await serverGet<CampaignDetail>(`/campaigns/${params.slug}`);
  if (!campaign) notFound();

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
          This campaign has not started yet. Prices shown below are regular outlet prices until it
          goes live.
        </p>
      ) : null}

      <div className="mt-6">
        <ProductGrid products={campaign.products} />
      </div>
    </div>
  );
}
