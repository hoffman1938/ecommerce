'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, formatDate, Badge } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';

interface CustomerDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'DISABLED';
  disabledReason: string | null;
  isEmailVerified: boolean;
  createdAt: string;
  addresses: Array<{
    id: string;
    line1: string;
    city: string;
    postalCode: string;
    countryCode: string;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalMinor: number;
    currencyCode: string;
    placedAt: string;
  }>;
  returnRequests: Array<{ id: string; rmaNumber: string; status: string; createdAt: string }>;
  supportNotes: Array<{
    id: string;
    note: string;
    createdAt: string;
    author: { email: string } | null;
  }>;
  refunds: Array<{ id: string; amountMinor: number; status: string; createdAt: string }>;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: customer } = useQuery({
    queryKey: ['admin-customer', params.id],
    queryFn: () => api.get<CustomerDetail>(`/admin/customers/${params.id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-customer', params.id] });
  if (!customer) return <p className="text-gray-500">Loading customer…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="text-sm text-gray-500">
            {customer.email} · joined {formatDate(customer.createdAt)}
            {customer.isEmailVerified ? ' · verified ✓' : ''}
          </p>
          {customer.status === 'DISABLED' ? (
            <p className="mt-1 text-sm text-red-600">
              Disabled{customer.disabledReason ? `: ${customer.disabledReason}` : ''}
            </p>
          ) : null}
        </div>
        {customer.status === 'ACTIVE' ? (
          <button
            type="button"
            onClick={async () => {
              const reason = window.prompt('Reason for disabling this account?');
              if (!reason) return;
              setError(null);
              try {
                await api.post(`/admin/customers/${customer.id}/disable`, { reason });
                refresh();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Disable failed.');
              }
            }}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:border-red-600"
          >
            Disable account
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await api.post(`/admin/customers/${customer.id}/enable`);
              refresh();
            }}
            className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm text-green-700 hover:border-green-600"
          >
            Re-enable account
          </button>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Orders</h2>
        <table className="admin-table">
          <tbody>
            {customer.orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="text-xs text-gray-500">{formatDate(order.placedAt)}</td>
                <td>
                  <Badge tone={order.status === 'CANCELLED' ? 'red' : 'blue'}>{order.status}</Badge>
                </td>
                <td className="text-right font-medium">
                  {formatMoney(order.totalMinor, order.currencyCode)}
                </td>
              </tr>
            ))}
            {customer.orders.length === 0 ? (
              <tr>
                <td className="text-gray-400">No orders.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
          <h2 className="mb-2 font-semibold">Addresses</h2>
          {customer.addresses.map((address) => (
            <p key={address.id} className="text-gray-600">
              {address.line1}, {address.postalCode} {address.city}, {address.countryCode}
            </p>
          ))}
          {customer.addresses.length === 0 ? <p className="text-gray-400">None saved.</p> : null}
        </section>
        <section className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
          <h2 className="mb-2 font-semibold">Returns &amp; refunds</h2>
          {customer.returnRequests.map((r) => (
            <p key={r.id} className="text-gray-600">
              <Link href={`/returns/${r.id}`} className="hover:underline">
                {r.rmaNumber}
              </Link>{' '}
              · {r.status}
            </p>
          ))}
          {customer.refunds.map((refund) => (
            <p key={refund.id} className="text-gray-600">
              Refund {formatMoney(refund.amountMinor)} · {refund.status}
            </p>
          ))}
          {customer.returnRequests.length === 0 && customer.refunds.length === 0 ? (
            <p className="text-gray-400">None.</p>
          ) : null}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Support notes</h2>
        <ul className="space-y-2 text-sm">
          {customer.supportNotes.map((supportNote) => (
            <li key={supportNote.id} className="rounded bg-gray-50 p-3">
              <p className="text-gray-700">{supportNote.note}</p>
              <p className="mt-1 text-xs text-gray-400">
                {supportNote.author?.email ?? 'unknown'} · {formatDate(supportNote.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note) return;
            await api.post(`/admin/customers/${customer.id}/notes`, { note });
            setNote('');
            refresh();
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a support note…"
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
