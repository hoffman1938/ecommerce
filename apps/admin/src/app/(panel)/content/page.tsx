'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';

interface ContentPage {
  key: string;
  title: string;
  body: string;
}

interface Settings {
  reservationDurationMinutes: number;
  lowStockThreshold: number;
  standardShippingMinor: number;
  expressShippingMinor: number;
  freeShippingThresholdMinor: number | null;
  taxRateBps: number;
}

export default function ContentSettingsPage() {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState('faq');
  const [pageDraft, setPageDraft] = useState<ContentPage | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: pages } = useQuery({
    queryKey: ['admin-content'],
    queryFn: () => api.get<ContentPage[]>('/admin/content/pages'),
  });
  const { data: settings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<Settings>('/admin/settings'),
  });

  useEffect(() => {
    const page = pages?.find((p) => p.key === selectedKey);
    if (page) setPageDraft({ ...page });
  }, [pages, selectedKey]);

  useEffect(() => {
    if (settings) setSettingsDraft({ ...settings });
  }, [settings]);

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold"><T id="ui.contentAmpSettings" /></h1>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold"><T id="ui.businessSettings" /></h2>
        {settingsDraft ? (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setMessage(null);
              try {
                await api.put('/admin/settings', settingsDraft);
                setMessage('Settings saved. New reservations use the updated duration.');
                queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Save failed.');
              }
            }}
          >
            {(
              [
                ['reservationDurationMinutes', 'Reservation duration (minutes)'],
                ['lowStockThreshold', 'Low-stock threshold'],
                ['standardShippingMinor', 'Standard shipping (minor units)'],
                ['expressShippingMinor', 'Express shipping (minor units)'],
                ['freeShippingThresholdMinor', 'Free shipping from (minor units)'],
                ['taxRateBps', 'VAT rate (basis points, 2000 = 20%)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block font-medium">{label}</span>
                <input
                  type="number"
                  value={settingsDraft[key] ?? 0}
                  onChange={(e) =>
                    setSettingsDraft((s) => (s ? { ...s, [key]: Number(e.target.value) } : s))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  data-testid={`setting-${key}`}
                />
              </label>
            ))}
            <div className="sm:col-span-2">
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"><T id="ui.saveSettings" /></button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-500"><T id="ui.loadingSettings" /></p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold"><T id="ui.contentPages" /></h2>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="mb-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {(pages ?? []).map((page) => (
            <option key={page.key} value={page.key}>
              {page.title} ({page.key})
            </option>
          ))}
        </select>
        {pageDraft ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setMessage(null);
              try {
                await api.put('/admin/content/pages', pageDraft);
                setMessage('Page saved.');
                queryClient.invalidateQueries({ queryKey: ['admin-content'] });
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Save failed.');
              }
            }}
          >
            <input
              value={pageDraft.title}
              onChange={(e) => setPageDraft((p) => (p ? { ...p, title: e.target.value } : p))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
            />
            <textarea
              rows={10}
              value={pageDraft.body}
              onChange={(e) => setPageDraft((p) => (p ? { ...p, body: e.target.value } : p))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"><T id="ui.savePage" /></button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
