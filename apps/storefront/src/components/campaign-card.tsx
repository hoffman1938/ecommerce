import Link from 'next/link';
import type { CampaignDto } from '@outlet/types';
import { formatDate } from '@outlet/ui';

export function CampaignCard({
  campaign,
  upcoming = false,
}: {
  campaign: CampaignDto;
  upcoming?: boolean;
}) {
  return (
    <Link
      href={`/campaigns/${campaign.slug}`}
      className="group overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[12/5] bg-gray-900">
        {campaign.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.coverImageUrl}
            alt={campaign.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-lg font-bold text-white">
            {campaign.title}
          </div>
        )}
        {upcoming ? (
          <span className="absolute left-2 top-2 rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
            Starts {formatDate(campaign.startsAt)}
          </span>
        ) : (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            Ends {formatDate(campaign.endsAt)}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold group-hover:underline">{campaign.title}</h3>
        {campaign.shortDescription ? (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{campaign.shortDescription}</p>
        ) : null}
      </div>
    </Link>
  );
}
