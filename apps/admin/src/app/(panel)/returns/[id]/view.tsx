'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReturnRequestDto } from '@outlet/types';
import { Badge } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

export default function ReturnDetailPage() {
  const { money } = useI18n();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [receiveState, setReceiveState] = useState<
    Record<string, { receivedQuantity: number; condition: string; restock: boolean }>
  >({});
  const [refundForm, setRefundForm] = useState({ amount: '', reason: 'Return refund' });

  const { data: request } = useQuery({
    queryKey: ['admin-return', params.id],
    queryFn: () => api.get<ReturnRequestDto>(`/admin/returns/${params.id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-return', params.id] });
  if (!request) return <p className="text-gray-500"><T id="ui.loadingReturn" /></p>;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{request.rmaNumber}</h1>
          <p className="text-sm text-gray-500">
            Order {request.orderNumber} · {request.reason}
          </p>
          {request.customerNote ? (
            <p className="mt-1 text-sm text-gray-600">“{request.customerNote}”</p>
          ) : null}
        </div>
        <Badge
          tone={
            request.status === 'COMPLETED'
              ? 'green'
              : request.status === 'REJECTED'
                ? 'red'
                : 'blue'
          }
        >
          {request.status}
        </Badge>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {request.status === 'REQUESTED' ? (
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="approve-return"
            onClick={() =>
              run(() => api.post(`/admin/returns/${request.id}/decision`, { decision: 'APPROVED' }))
            }
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
          ><T id="ui.approveReturn" /></button>
          <button
            type="button"
            onClick={() => {
              const note = window.prompt('Reason for rejection?') ?? undefined;
              run(() =>
                api.post(`/admin/returns/${request.id}/decision`, {
                  decision: 'REJECTED',
                  internalNote: note,
                }),
              );
            }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Reject
          </button>
        </div>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold"><T id="ui.items" /></h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th><T id="ui.item" /></th>
              <th className="text-right">Requested</th>
              <th className="text-right">Received</th>
              <th>Condition</th>
              <th>Restock</th>
            </tr>
          </thead>
          <tbody>
            {request.items.map((item) => {
              const state = receiveState[item.id] ?? {
                receivedQuantity: item.quantity,
                condition: 'RESELLABLE',
                restock: true,
              };
              const editable = request.status === 'APPROVED';
              return (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    <span className="block font-mono text-xs text-gray-400">{item.sku}</span>
                  </td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={state.receivedQuantity}
                        onChange={(e) =>
                          setReceiveState((s) => ({
                            ...s,
                            [item.id]: { ...state, receivedQuantity: Number(e.target.value) },
                          }))
                        }
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-right"
                      />
                    ) : (
                      item.receivedQuantity
                    )}
                  </td>
                  <td>
                    {editable ? (
                      <select
                        value={state.condition}
                        onChange={(e) =>
                          setReceiveState((s) => ({
                            ...s,
                            [item.id]: { ...state, condition: e.target.value },
                          }))
                        }
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        {['RESELLABLE', 'DAMAGED', 'UNINSPECTED'].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      item.condition
                    )}
                  </td>
                  <td>
                    {editable ? (
                      <input
                        type="checkbox"
                        checked={state.restock && state.condition === 'RESELLABLE'}
                        disabled={state.condition !== 'RESELLABLE'}
                        onChange={(e) =>
                          setReceiveState((s) => ({
                            ...s,
                            [item.id]: { ...state, restock: e.target.checked },
                          }))
                        }
                      />
                    ) : item.restockedQuantity > 0 ? (
                      `${item.restockedQuantity} restocked`
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {request.status === 'APPROVED' ? (
          <button
            type="button"
            data-testid="receive-return"
            onClick={() =>
              run(() =>
                api.post(`/admin/returns/${request.id}/receive`, {
                  items: request.items.map((item) => {
                    const state = receiveState[item.id] ?? {
                      receivedQuantity: item.quantity,
                      condition: 'RESELLABLE',
                      restock: true,
                    };
                    return {
                      returnItemId: item.id,
                      receivedQuantity: state.receivedQuantity,
                      condition: state.condition,
                      restock: state.restock,
                    };
                  }),
                }),
              )
            }
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          ><T id="ui.recordReceivedItems" /></button>
        ) : null}
        {request.status === 'RECEIVED' ? (
          <button
            type="button"
            data-testid="complete-return"
            onClick={() => run(() => api.post(`/admin/returns/${request.id}/complete`))}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          ><T id="ui.completeReturn" /></button>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold"><T id="ui.refundsThisReturn" /></h2>
        {request.refunds.length > 0 ? (
          <ul className="mb-3 space-y-1 text-sm">
            {request.refunds.map((refund) => (
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
        ) : (
          <p className="mb-3 text-sm text-gray-500"><T id="ui.noRefundsIssuedYet" /></p>
        )}
        {['RECEIVED', 'COMPLETED'].includes(request.status) ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                api.post('/admin/orders/refunds', {
                  orderId: request.orderId,
                  amountMinor: Number(refundForm.amount),
                  reason: refundForm.reason,
                  returnRequestId: request.id,
                }),
              );
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500"><T id="ui.amountMinorUnits2" /></span>
              <input
                type="number"
                min={1}
                required
                value={refundForm.amount}
                onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-40 rounded-md border border-gray-300 px-2 py-1.5"
                data-testid="return-refund-amount"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Reason</span>
              <input
                required
                value={refundForm.reason}
                onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-64 rounded-md border border-gray-300 px-2 py-1.5"
              />
            </label>
            <button
              data-testid="return-refund-submit"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            ><T id="ui.issueRefund" /></button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
