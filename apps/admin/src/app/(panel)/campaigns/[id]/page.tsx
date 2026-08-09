import { DEMO_CAMPAIGNS } from '@/lib/demo/data';
import CampaignDetailView from './view';

/** See products/[id]/page.tsx for why this split exists. */
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return [];
  return DEMO_CAMPAIGNS.map((campaign) => ({ id: campaign.id }));
}

export default function Page() {
  return <CampaignDetailView />;
}
