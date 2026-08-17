'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatDate, Badge } from '@outlet/ui';
import { api, API_BASE_URL, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';
import { DetailState } from '@/components/detail-state';

interface AdminOrderDetail extends OrderDto {
  internalNote: string | null;
  customerNote: string | null;
  customer: { id: string; email: string; firstName: string; lastName: string } | null;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }>;
  refunds: Array<{
    id: string;
    amountMinor: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
}

export default function AdminOrderDetailPage() {
  const { t, money } = useI18n();
  // Addressed as ?id=… rather than as a route segment; see ./page.tsx.
  const params = { id: useSearchParams().get('id') ?? '' };
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState({
    status: 'PROCESSING',
    trackingNumber: '',
    carrier: 'DHL',
    note: '',
  });
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });
  const [note, setNote] = useState('');

  const { data: order, error: loadError } = useQuery({
    queryKey: ['admin-order', params.id],
    queryFn: () => api.get<AdminOrderDetail>(`/admin/orders/${params.id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-order', params.id] });
  if (!order)
    return (
      <DetailState
        error={loadError}
        loadingLabel={t('ui.loadingOrder')}
        noun="order"
        backHref="/orders"
        backLabel="Back to orders"
      />
    );

  const paidPayment = order.payments.find((p) => ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status));
  const refundableMinor = paidPayment
    ? paidPayment.amountMinor - paidPayment.refundedAmountMinor
    : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-gray-500">
            {formatDate(order.placedAt)} · {order.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            tone={
              order.status === 'CANCELLED' ? 'red' : order.status === 'DELIVERED' ? 'green' : 'blue'
            }
          >
            {order.status}
          </Badge>
          <a
            href={`${API_BASE_URL}/admin/orders/${order.id}/invoice`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:border-gray-900"
          >
            Invoice
          </a>
          <a
            href={`${API_BASE_URL}/admin/orders/${order.id}/packing-slip`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:border-gray-900"
          >
            <T id="ui.packingSlip" />
          </a>
          <button
            type="button"
            onClick={async () => {
              await api
                .post(`/admin/orders/${order.id}/resend-confirmation`)
                .catch(() => undefined);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:border-gray-900"
          >
            <T id="ui.resendEmail" />
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">
          <T id="ui.items" />
        </h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>
                <T id="ui.item" />
              </th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit</th>
              <th className="text-right">
                <T id="ui.total" />
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="font-mono text-xs">{item.sku}</td>
                <td>
                  {item.name}
                  {item.returnedQuantity > 0 ? (
                    <span className="ml-1 text-xs text-amber-600">
                      ({item.returnedQuantity} returned)
                    </span>
                  ) : null}
                </td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right">{money(item.unitPriceMinor)}</td>
                <td className="text-right font-medium">{money(item.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-sm">
          Subtotal {money(order.subtotalMinor)} · Discount {money(order.discountMinor)} · Shipping{' '}
          {money(order.shippingMinor)} · <strong>Total {money(order.totalMinor)}</strong>
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">
            <T id="ui.updateFulfillment" />
          </h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await api.post(`/admin/orders/${order.id}/status`, {
                  status: statusForm.status,
                  note: statusForm.note || null,
                  trackingNumber: statusForm.trackingNumber || null,
                  carrier: statusForm.carrier || null,
                });
                refresh();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Status update failed.');
              }
            }}
          >
            <select
              value={statusForm.status}
              onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="order-status-select"
            >
              {['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {statusForm.status === 'SHIPPED' ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder={t('ui.carrier')}
                  value={statusForm.carrier}
                  onChange={(e) => setStatusForm((f) => ({ ...f, carrier: e.target.value }))}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder={t('ui.trackingNumber')}
                  value={statusForm.trackingNumber}
                  onChange={(e) => setStatusForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  data-testid="tracking-number"
                />
              </div>
            ) : null}
            <input
              placeholder={t('ui.noteOptionalRequiredContextCancellations')}
              value={statusForm.note}
              onChange={(e) => setStatusForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              data-testid="order-status-submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
            >
              <T id="ui.applyStatus" />
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Refunds</h2>
          {order.refunds.length > 0 ? (
            <ul className="mb-3 space-y-1 text-sm">
              {order.refunds.map((refund) => (
                <li key={refund.id} className="flex justify-between">
                  <span className="text-gray-600">{refund.reason ?? 'Refund'}</span>
                  <span>
                    {money(refund.amountMinor)}{' '}
                    <Badge tone={refund.status === 'SUCCEEDED' ? 'green' : 'yellow'}>
                      {refund.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {paidPayment && refundableMinor > 0 ? (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                try {
                  await api.post('/admin/orders/refunds', {
                    orderId: order.id,
                    amountMinor: Number(refundForm.amount),
                    reason: refundForm.reason,
                  });
                  setRefundForm({ amount: '', reason: '' });
                  refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Refund failed.');
                }
              }}
            >
              <p className="text-sm text-gray-500">Refundable: {money(refundableMinor)}</p>
              <input
                type="number"
                min={1}
                max={refundableMinor}
                required
                placeholder={t('ui.amountMinorUnits')}
                value={refundForm.amount}
                onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="refund-amount"
              />
              <input
                required
                placeholder={t('ui.reason')}
                value={refundForm.reason}
                onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="refund-reason"
              />
              <button
                data-testid="refund-submit"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                <T id="ui.issueRefund" />
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">
              {paidPayment ? 'Fully refunded.' : 'No refundable payment on this order.'}
            </p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">
          <T id="ui.historyAmpNotes" />
        </h2>
        <ul className="space-y-1 text-sm">
          {order.statusHistory.map((entry) => (
            <li key={entry.id} className="text-gray-600">
              <span className="text-xs text-gray-400">{formatDate(entry.createdAt)}</span>{' '}
              {entry.fromStatus ? `${entry.fromStatus} → ` : ''}
              <strong>{entry.toStatus}</strong>
              {entry.note ? ` — ${entry.note}` : ''}
            </li>
          ))}
        </ul>
        {order.internalNote ? (
          <p className="mt-3 whitespace-pre-line rounded bg-yellow-50 p-3 text-sm text-yellow-900">
            {order.internalNote}
          </p>
        ) : null}
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note) return;
            await api.post(`/admin/orders/${order.id}/notes`, { note });
            setNote('');
            refresh();
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('ui.addInternalNote')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
