'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatMoney, formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';

const STATUSES = [
  '', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED',
  'CANCELLED', 'RETURN_REQUESTED', 'PARTIALLY_RETURNED', 'RETURNED',
];

export default function OrdersAdminPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['admin-orders', q, status, page],
    queryFn: () =>
      api.get<{ items: OrderDto[]; totalPages: number }>(
        `/admin/orders?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`,
      ),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Orders</h1>
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search order number or email…"
          className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th className="text-right">Total</th></tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline" data-testid={`order-${order.orderNumber}`}>
                    {order.orderNumber}
                  </Link>
                  <span className="block text-xs text-gray-400">{formatDate(order.placedAt)}</span>
                </td>
                <td className="text-gray-500">{order.email}</td>
                <td>
                  <Badge tone={order.status === 'CANCELLED' ? 'red' : order.status === 'DELIVERED' ? 'green' : 'blue'}>
                    {order.status}
                  </Badge>
                </td>
                <td>
                  {order.payments[0] ? (
                    <Badge tone={order.payments[0].status === 'PAID' ? 'green' : order.payments[0].status === 'FAILED' ? 'red' : 'gray'}>
                      {order.payments[0].status}
                    </Badge>
                  ) : '—'}
                </td>
                <td className="text-right font-medium">{formatMoney(order.totalMinor, order.currencyCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">← Prev</button>
          <span className="text-gray-500">Page {page} / {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next →</button>
        </div>
      ) : null}
    </div>
  );
}
