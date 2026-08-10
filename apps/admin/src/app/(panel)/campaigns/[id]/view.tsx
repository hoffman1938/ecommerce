'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  CampaignForm,
  EMPTY_CAMPAIGN,
  toCampaignPayload,
  type CampaignFormValues,
} from '@/components/campaign-form';

interface AdminCampaignDetail extends CampaignFormValues {
  id: string;
  products: Array<{
    id: string;
    productId: string;
    campaignPriceMinor: number | null;
    maxQuantityPerOrder: number | null;
    product: { id: string; name: string; outletPriceMinor: number; brand: { name: string } };
  }>;
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditCampaignPage() {
  const { money } = useI18n();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CampaignFormValues>(EMPTY_CAMPAIGN);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ productId: '', campaignPriceMinor: '' });

  const { data: campaign } = useQuery({
    queryKey: ['admin-campaign', params.id],
    queryFn: () => api.get<AdminCampaignDetail>(`/admin/campaigns/${params.id}`),
  });
  const { data: products } = useQuery({
    queryKey: ['admin-products-all'],
    queryFn: () =>
      api.get<{ items: Array<{ id: string; name: string }> }>(
        '/admin/products?page=1&pageSize=100',
      ),
  });

  useEffect(() => {
    if (campaign) {
      setValues({
        title: campaign.title,
        slug: campaign.slug,
        shortDescription: campaign.shortDescription ?? '',
        description: campaign.description ?? '',
        startsAt: toLocalInput(campaign.startsAt),
        endsAt: toLocalInput(campaign.endsAt),
        status: campaign.status,
        position: campaign.position,
        isVisible: campaign.isVisible,
        seoTitle: campaign.seoTitle ?? '',
        seoDescription: campaign.seoDescription ?? '',
      });
    }
  }, [campaign]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-campaign', params.id] });

  if (!campaign) return <p className="text-gray-500">Loading campaign…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold">{campaign.title}</h1>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      <CampaignForm
        values={values}
        onChange={setValues}
        submitLabel="Save campaign"
        error={error}
        onSubmit={async () => {
          setError(null);
          setMessage(null);
          try {
            await api.put(`/admin/campaigns/${campaign.id}`, toCampaignPayload(values));
            setMessage('Campaign saved.');
            refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Save failed.');
          }
        }}
      />

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Assigned products</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="text-right">Outlet price</th>
              <th className="text-right">Campaign price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaign.products.map((cp) => (
              <tr key={cp.id}>
                <td>
                  {cp.product.name}
                  <span className="block text-xs text-gray-400">{cp.product.brand.name}</span>
                </td>
                <td className="text-right">{money(cp.product.outletPriceMinor)}</td>
                <td className="text-right font-semibold text-red-600">
                  {cp.campaignPriceMinor != null ? money(cp.campaignPriceMinor) : '—'}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.delete(`/admin/campaigns/${campaign.id}/products/${cp.productId}`);
                      refresh();
                    }}
                    className="text-xs text-red-600 underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!assignForm.productId) return;
            setError(null);
            try {
              await api.post(`/admin/campaigns/${campaign.id}/products`, {
                productId: assignForm.productId,
                campaignPriceMinor: assignForm.campaignPriceMinor
                  ? Number(assignForm.campaignPriceMinor)
                  : null,
              });
              setAssignForm({ productId: '', campaignPriceMinor: '' });
              refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Assignment failed.');
            }
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Product</span>
            <select
              value={assignForm.productId}
              onChange={(e) => setAssignForm((f) => ({ ...f, productId: e.target.value }))}
              className="w-64 rounded-md border border-gray-300 px-2 py-1.5"
              data-testid="assign-product"
            >
              <option value="">Select a product…</option>
              {(products?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Campaign price (minor units, optional)
            </span>
            <input
              type="number"
              min={1}
              value={assignForm.campaignPriceMinor}
              onChange={(e) => setAssignForm((f) => ({ ...f, campaignPriceMinor: e.target.value }))}
              className="w-40 rounded-md border border-gray-300 px-2 py-1.5"
              data-testid="assign-price"
            />
          </label>
          <button
            data-testid="assign-submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Assign product
          </button>
        </form>
      </section>
    </div>
  );
}
