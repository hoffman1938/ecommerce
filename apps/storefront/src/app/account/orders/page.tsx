'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

export default function OrdersPage() {
  const { money } = useI18n();
  const { data: orders, isLoading } = useQuery({
    queryKey: ['account-orders'],
    queryFn: () => api.get<OrderDto[]>('/account/orders'),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">
        <T id="ui.orderHistory" />
      </h1>
      {isLoading ? (
        <p className="text-ink-500">
          <T id="ui.loading" />
        </p>
      ) : !orders || orders.length === 0 ? (
        <p className="text-ink-500">
          <T id="ui.noOrdersYet" />
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/account/orders/view?id=${order.id}`}
              className="flex items-center justify-between rounded border border-line bg-ink-25 dark:bg-surface-card p-4 hover:shadow-sm"
            >
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-ink-500">
                  {formatDate(order.placedAt)} · {order.items.length} item(s)
                </p>
              </div>
              <div className="text-right">
                <Badge
                  tone={
                    order.status === 'CANCELLED'
                      ? 'red'
                      : order.status === 'DELIVERED'
                        ? 'green'
                        : 'blue'
                  }
                >
                  {order.status}
                </Badge>
                <p className="mt-1 font-medium">{money(order.totalMinor)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
