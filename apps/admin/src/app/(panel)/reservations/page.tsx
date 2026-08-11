'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReservationAdminDto } from '@outlet/types';
import { Badge } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';

const STATUSES = [
  '',
  'ACTIVE',
  'CHECKOUT_STARTED',
  'PAYMENT_PROCESSING',
  'CONVERTED',
  'EXPIRED',
  'CANCELLED',
];

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-reservations', status],
    queryFn: () =>
      api.get<{ items: ReservationAdminDto[] }>(
        `/admin/inventory/reservations?page=1&pageSize=100${status ? `&status=${status}` : ''}`,
      ),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Reservations</h1>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              status === s ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>
                <T id="ui.product" />
              </th>
              <th className="text-right">Qty</th>
              <th>
                <T id="ui.status" />
              </th>
              <th>
                <T id="ui.customer" />
              </th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => {
              const expired = new Date(r.expiresAt) <= new Date();
              const holding = ['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING'].includes(
                r.status,
              );
              return (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.sku}</td>
                  <td>{r.productName}</td>
                  <td className="text-right">{r.quantity}</td>
                  <td>
                    <Badge tone={r.status === 'CONVERTED' ? 'green' : holding ? 'blue' : 'gray'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="text-gray-500">{r.customerEmail ?? 'anonymous'}</td>
                  <td
                    className={`text-xs ${expired && holding ? 'text-red-600' : 'text-gray-500'}`}
                  >
                    {new Date(r.expiresAt).toLocaleString()}
                  </td>
                  <td className="text-right">
                    {holding ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const reason = window.prompt('Reason for cancelling this reservation?');
                          if (!reason) return;
                          setError(null);
                          try {
                            await api.post(`/admin/inventory/reservations/${r.id}/cancel`, {
                              reason,
                            });
                            queryClient.invalidateQueries({ queryKey: ['admin-reservations'] });
                          } catch (err) {
                            setError(err instanceof ApiError ? err.message : 'Cancel failed.');
                          }
                        }}
                        className="text-xs text-red-600 underline"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-gray-400">
                  <T id="ui.noReservationsWithThisStatus" />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
