'use client';

import type { FreeShippingProgressDto } from '@outlet/types';
import { CheckIcon, TruckIcon } from '@outlet/ui';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

/**
 * Progress toward free delivery.
 *
 * The number it shows is the server's, computed from the real basket and the
 * real threshold — there is no invented urgency here, only a fact the shopper
 * would otherwise have to work out at checkout. Once qualified it stops nagging
 * and simply confirms.
 */
export function FreeShippingBar({
  progress,
}: {
  progress: FreeShippingProgressDto;
  currency: string;
}) {
  const { t, money } = useI18n();
  const percent = progress.qualified
    ? 100
    : Math.max(
        4,
        Math.min(
          100,
          Math.round(
            ((progress.thresholdMinor - progress.remainingMinor) / progress.thresholdMinor) * 100,
          ),
        ),
      );

  return (
    <div>
      <p className="flex items-center gap-2 text-xs">
        {progress.qualified ? (
          <>
            <CheckIcon className="h-4 w-4 shrink-0 text-success-600" />
            <span className="font-medium text-success-600">
              <T id="ui.standardDeliveryFreeThisOrder" />
            </span>
          </>
        ) : (
          <>
            <TruckIcon className="h-4 w-4 shrink-0 text-ink-500" />
            <span className="text-ink-600">
              <span data-numeric className="font-semibold text-ink-950">
                {money(progress.remainingMinor)}
              </span>{' '}
              <T id="ui.moreUnlockFreeShipping" />
            </span>
          </>
        )}
      </p>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-ink-100 dark:bg-surface-active"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('ui.progressTowardFreeDelivery')}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            progress.qualified ? 'bg-success-600' : 'bg-ink-950'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
