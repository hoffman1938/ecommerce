'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

export default function AccountOverviewPage() {
  const { money } = useI18n();
  const { data: orders } = useQuery({
    queryKey: ['account-orders'],
    queryFn: () => api.get<OrderDto[]>('/account/orders'),
  });

  const recent = orders?.slice(0, 5) ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold"><T id="ui.accountOverview" /></h1>
      <section className="rounded border border-line bg-ink-25 p-4 dark:bg-surface-card sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold"><T id="ui.recentOrders" /></h2>
          <Link href="/account/orders" className="text-sm text-ink-500 hover:underline"><T id="ui.viewAll" /></Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-500"><T id="ui.noOrdersYetGrabDeal" /></p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recent.map((order) => (
                <tr key={order.id} className="border-t border-ink-100">
                  <td className="py-2">
                    <Link
                      href={`/account/orders/view?id=${order.id}`}
                      className="font-medium hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 text-ink-500">{formatDate(order.placedAt)}</td>
                  <td className="py-2">
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
                  </td>
                  <td className="py-2 text-right font-medium">
                    {money(order.totalMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
