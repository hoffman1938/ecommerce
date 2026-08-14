'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';

interface AdminCampaign {
  id: string;
  title: string;
  slug: string;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'ARCHIVED';
  startsAt: string;
  endsAt: string;
  _count: { products: number };
}

const TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  DRAFT: 'gray',
  SCHEDULED: 'blue',
  ACTIVE: 'green',
  PAUSED: 'yellow',
  ENDED: 'gray',
  ARCHIVED: 'red',
};

export default function CampaignsAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: campaigns } = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: () => api.get<AdminCampaign[]>('/admin/campaigns'),
  });

  const act = async (id: string, action: string) => {
    setError(null);
    try {
      await api.post(`/admin/campaigns/${id}/status`, { action });
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link
          href="/campaigns/new"
          data-testid="new-campaign"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          <T id="ui.newCampaign" />
        </Link>
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Window</th>
              <th>
                <T id="ui.status" />
              </th>
              <th className="text-right">
                <T id="ui.products" />
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(campaigns ?? []).map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <Link
                    href={`/campaigns/view?id=${campaign.id}`}
                    className="font-medium hover:underline"
                  >
                    {campaign.title}
                  </Link>
                  <span className="block font-mono text-xs text-gray-400">{campaign.slug}</span>
                </td>
                <td className="text-xs text-gray-500">
                  {new Date(campaign.startsAt).toLocaleString()} →{' '}
                  {new Date(campaign.endsAt).toLocaleString()}
                </td>
                <td>
                  <Badge tone={TONE[campaign.status]}>{campaign.status}</Badge>
                </td>
                <td className="text-right">{campaign._count.products}</td>
                <td>
                  <div className="flex gap-2 text-xs">
                    {campaign.status !== 'ACTIVE' && campaign.status !== 'ARCHIVED' ? (
                      <button
                        onClick={() => act(campaign.id, 'activate')}
                        className="text-green-700 underline"
                      >
                        Activate
                      </button>
                    ) : null}
                    {campaign.status === 'ACTIVE' ? (
                      <>
                        <button
                          onClick={() => act(campaign.id, 'pause')}
                          className="text-amber-600 underline"
                        >
                          Pause
                        </button>
                        <button
                          onClick={() => act(campaign.id, 'end')}
                          className="text-gray-600 underline"
                        >
                          End
                        </button>
                      </>
                    ) : null}
                    {campaign.status !== 'ARCHIVED' ? (
                      <button
                        onClick={() => act(campaign.id, 'archive')}
                        className="text-red-600 underline"
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
