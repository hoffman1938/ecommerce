'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatMoney, formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ['account-orders'],
    queryFn: () => api.get<OrderDto[]>('/account/orders'),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Order history</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !orders || orders.length === 0 ? (
        <p className="text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/account/orders/${order.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-ink-25 p-4 hover:shadow-sm"
            >
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-gray-500">
                  {formatDate(order.placedAt)} · {order.items.length} item(s)
                </p>
              </div>
              <div className="text-right">
                <Badge tone={order.status === 'CANCELLED' ? 'red' : order.status === 'DELIVERED' ? 'green' : 'blue'}>
                  {order.status}
                </Badge>
                <p className="mt-1 font-medium">{formatMoney(order.totalMinor, order.currencyCode)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
