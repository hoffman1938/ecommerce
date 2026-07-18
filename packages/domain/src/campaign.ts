import type { CampaignStatus } from '@outlet/types';

/**
 * A campaign's *effective* running state is derived from its status AND its
 * dates. Statuses are moved by the worker (SCHEDULED -> ACTIVE -> ENDED), but
 * pricing decisions never rely on the sweep being on time: a campaign whose
 * end date passed is not running even if its row still says ACTIVE.
 */
export function isCampaignRunning(
  campaign: { status: CampaignStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): boolean {
  if (campaign.status !== 'ACTIVE' && campaign.status !== 'SCHEDULED') return false;
  return campaign.startsAt <= now && campaign.endsAt > now && campaign.status === 'ACTIVE';
}

/** Status a campaign should have based on its dates (used by the sweep). */
export function expectedCampaignStatus(
  campaign: { status: CampaignStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): CampaignStatus {
  // Manual states are never overridden by the sweep.
  if (
    campaign.status === 'DRAFT' ||
    campaign.status === 'PAUSED' ||
    campaign.status === 'ARCHIVED'
  ) {
    return campaign.status;
  }
  if (now < campaign.startsAt) return 'SCHEDULED';
  if (now >= campaign.endsAt) return 'ENDED';
  return 'ACTIVE';
}
