'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';
import {
  CampaignForm,
  EMPTY_CAMPAIGN,
  toCampaignPayload,
  type CampaignFormValues,
} from '@/components/campaign-form';

export default function NewCampaignPage() {
  const router = useRouter();
  const [values, setValues] = useState<CampaignFormValues>(EMPTY_CAMPAIGN);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">
        <T id="ui.newCampaign" />
      </h1>
      <CampaignForm
        values={values}
        onChange={setValues}
        submitLabel="Create campaign"
        error={error}
        onSubmit={async () => {
          setError(null);
          try {
            const campaign = await api.post<{ id: string }>(
              '/admin/campaigns',
              toCampaignPayload(values),
            );
            router.push(`/campaigns/view?id=${campaign.id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Create failed.');
          }
        }}
      />
    </div>
  );
}
