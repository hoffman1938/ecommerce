import { CampaignSections } from '@/components/campaign-sections';
import { PageHeader } from '@/components/section';
import { T } from '@/components/t';

export const metadata = { title: 'Campaigns' };

export default function CampaignsPage() {
  return (
    <div className="container-page py-6 lg:py-12">
      <PageHeader
        title={<T id="ui.campaigns" />}
        description={<T id="ui.campaignsIntro" />}
      />
      {/* CampaignSections supplies its own section spacing and rules. */}
      <div className="-mt-4">
        <CampaignSections />
      </div>
    </div>
  );
}
