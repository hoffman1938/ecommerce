import { CampaignDetail } from '@/components/campaign-sections';
import { CAMPAIGN_LIST } from '@/lib/demo/data';

/** Pre-render every campaign so the app can be exported statically. */
export function generateStaticParams() {
  return CAMPAIGN_LIST.map((campaign) => ({ slug: campaign.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const campaign = CAMPAIGN_LIST.find((c) => c.slug === params.slug);
  if (!campaign) return { title: 'Campaign' };
  return { title: campaign.title, description: campaign.shortDescription };
}

export default function CampaignDetailPage({ params }: { params: { slug: string } }) {
  return <CampaignDetail slug={params.slug} />;
}
