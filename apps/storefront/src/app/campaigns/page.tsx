import type { CampaignDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { CampaignCard } from '@/components/campaign-card';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Campaigns' };

export default async function CampaignsPage() {
  const [active, upcoming] = await Promise.all([
    serverGet<CampaignDto[]>('/campaigns?status=active'),
    serverGet<CampaignDto[]>('/campaigns?status=upcoming'),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-bold">Active campaigns</h1>
        {active && active.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No campaigns are running right now.</p>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-xl font-bold">Upcoming campaigns</h2>
        {upcoming && upcoming.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((c) => (
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
