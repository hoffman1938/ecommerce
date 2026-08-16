'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

function NewReturnInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get('orderId') ?? '';
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('Wrong size');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: order } = useQuery({
    queryKey: ['account-order', orderId],
    queryFn: () => api.get<OrderDto>(`/account/orders/${orderId}`),
    enabled: Boolean(orderId),
  });

  if (!orderId)
    return (
      <p className="text-ink-500">
        <T id="ui.missingOrderReference" />
      </p>
    );
  if (!order)
    return (
      <p className="text-ink-500">
        <T id="ui.loadingOrder" />
      </p>
    );

  const returnable = order.items.filter((i) => i.returnableQuantity > 0);
  const selectedItems = returnable
    .filter((i) => (quantities[i.id] ?? 0) > 0)
    .map((i) => ({ orderItemId: i.id, quantity: quantities[i.id] }));

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold">Return items from {order.orderNumber}</h1>
      {error ? (
        <p className="mt-4 rounded border border-sale-200 bg-sale-50 px-4 py-2 text-sm text-sale-700">
          {error}
        </p>
      ) : null}
      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (selectedItems.length === 0) {
            setError(t('ui.selectAtLeastOneItem'));
            return;
          }
          setError(null);
          try {
            await api.post('/account/returns', {
              orderId,
              reason,
              customerNote: note || null,
              items: selectedItems,
            });
            router.push('/account/returns');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not create the return.');
          }
        }}
      >
        <div className="space-y-3 rounded border border-line bg-ink-25 dark:bg-surface-card p-4">
          {returnable.map((item) => (
            <label key={item.id} className="flex items-center justify-between gap-4 text-sm">
              <span>
                {item.name} <span className="text-ink-500">({item.sku})</span>
              </span>
              <select
                value={quantities[item.id] ?? 0}
                onChange={(e) =>
                  setQuantities((q) => ({ ...q, [item.id]: Number(e.target.value) }))
                }
                className="rounded border border-ink-300 px-2 py-1"
              >
                {Array.from({ length: item.returnableQuantity + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            <T id="ui.reason" />
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-ink-300 px-3 py-2"
          >
            {['Wrong size', 'Damaged or defective', 'Not as described', 'Changed my mind'].map(
              (r) => (
                <option key={r}>{r}</option>
              ),
            )}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            <T id="ui.noteOptional" />
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded border border-ink-300 px-3 py-2"
          />
        </label>
        <button className="rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25 hover:bg-ink-800">
          <T id="ui.submitReturnRequest" />
        </button>
      </form>
    </div>
  );
}

export default function NewReturnPage() {
  return (
    <Suspense>
      <NewReturnInner />
    </Suspense>
  );
}
