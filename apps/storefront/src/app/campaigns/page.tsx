import { CampaignSections } from '@/components/campaign-sections';
import { PageHeader } from '@/components/section';

export const metadata = { title: 'Campaigns' };

export default function CampaignsPage() {
  return (
    <div className="container-page py-8 lg:py-12">
      <PageHeader
        title="Campaigns"
        description="Limited-time releases of surplus stock. Each campaign runs until its timer ends or the stock is gone."
      />
      {/* CampaignSections supplies its own section spacing and rules. */}
      <div className="-mt-4">
        <CampaignSections />
      </div>
    </div>
  );
}
