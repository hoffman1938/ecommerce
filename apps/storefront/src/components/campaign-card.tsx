import Link from 'next/link';
import type { CampaignDto } from '@outlet/types';
import { ImageIcon, cx } from '@outlet/ui';
import { Countdown } from './countdown';

const DATE_SHORT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });

/**
 * Campaign tile. The cover art is the subject, so the title sits on the image
 * over a bottom-weighted scrim rather than in a separate panel below it — that
 * keeps a row of campaigns reading as banners instead of as generic cards.
 *
 * Everything here is pinned to fixed colours rather than theme tokens. The
 * label sits on artwork and is white in both themes, so the scrim under it has
 * to be dark in both themes too. Built on `ink`, the theme inverted the scrim
 * to a white wash and the card became white-on-white — 1.19:1 — while still
 * looking plausible in the light theme it was designed against.
 */
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
      className="group relative block overflow-hidden rounded bg-scrim-900 dark:rounded-lg dark:ring-1 dark:ring-inset dark:ring-line"
    >
      <div className="relative aspect-[16/10] sm:aspect-[3/2] lg:aspect-[16/10]">
        {campaign.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-scrim-800">
            <ImageIcon className="h-12 w-12 text-white/25" />
          </div>
        )}

        {/* Slightly deeper in dark: the same scrim that reads as "type over a
            photograph" on a white page reads as a grey haze once the card is
            the brightest thing on screen. */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-scrim-950/85 via-scrim-950/25 to-transparent dark:from-scrim-950/90 dark:via-scrim-950/35"
          aria-hidden="true"
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span
            className={cx(
              'rounded-xs px-1.5 py-0.5 text-2xs font-bold uppercase tracking-[0.06em]',
              upcoming ? 'bg-white text-scrim-950' : 'bg-sale-brand text-white',
            )}
          >
            {upcoming ? `Starts ${DATE_SHORT.format(new Date(campaign.startsAt))}` : 'Live now'}
          </span>
          {campaign.productCount ? (
            <span data-numeric className="text-2xs font-medium text-white/80">
              {campaign.productCount} items
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="text-lg font-bold leading-tight tracking-[-0.015em] text-white">
            {campaign.title}
          </h3>
          {campaign.shortDescription ? (
            <p className="mt-1 line-clamp-1 text-sm text-white/75">{campaign.shortDescription}</p>
          ) : null}
          {!upcoming ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-white/80">
              {/* Sits on the dark scrim in both themes, so it wants the bright
                  end of the ramp rather than the badge's deep brand red. */}
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-sale-400 dark:bg-sale-500"
                aria-hidden="true"
              />
              Ends in <Countdown expiresAt={campaign.endsAt} tone="inverse" />
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
