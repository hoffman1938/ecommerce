'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { DashboardStatsDto } from '@outlet/types';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

function StatCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const { t, money } = useI18n();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStatsDto>('/admin/dashboard'),
    refetchInterval: 60_000,
  });

  if (isLoading || !stats)
    return (
      <p className="text-gray-500">
        <T id="ui.loadingDashboard" />
      </p>
    );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('ui.revenue')} value={money(stats.revenueMinor)} />
        <StatCard label={t('ui.orders')} value={String(stats.orderCount)} href="/orders" />
        <StatCard label={t('ui.avgOrderValue')} value={money(stats.averageOrderValueMinor)} />
        <StatCard
          label={t('ui.lowStockSkus')}
          value={String(stats.lowStockCount)}
          href="/inventory"
        />
        <StatCard
          label={t('ui.activeReservations')}
          value={String(stats.activeReservationCount)}
          href="/reservations"
        />
        <StatCard
          label={t('ui.expiredReservations')}
          value={String(stats.expiredReservationCount)}
        />
        <StatCard label={t('ui.failedPayments')} value={String(stats.failedPaymentCount)} />
        <StatCard
          label={t('ui.openReturns')}
          value={String(stats.openReturnCount)}
          href="/returns"
        />
        <StatCard
          label={t('ui.activeCampaigns')}
          value={String(stats.activeCampaignCount)}
          href="/campaigns"
        />
        <StatCard
          label={t('ui.upcomingCampaigns')}
          value={String(stats.upcomingCampaignCount)}
          href="/campaigns"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">
            <T id="ui.recentOrders" />
          </h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <T id="ui.order" />
                </th>
                <th>
                  <T id="ui.customer" />
                </th>
                <th>
                  <T id="ui.status" />
                </th>
                <th className="text-right">
                  <T id="ui.total" />
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      href={`/orders/view?id=${order.id}`}
                      className="font-medium hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <span className="block text-xs text-gray-400">
                      {formatDate(order.placedAt)}
                    </span>
                  </td>
                  <td className="text-gray-500">{order.email}</td>
                  <td>
                    <Badge tone={order.status === 'CANCELLED' ? 'red' : 'blue'}>
                      {order.status}
                    </Badge>
                  </td>
                  <td className="text-right font-medium">{money(order.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">
            <T id="ui.lowStock" />
          </h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>
                  <T id="ui.product" />
                </th>
                <th className="text-right">Available</th>
              </tr>
            </thead>
            <tbody>
              {stats.lowStockVariants.map((row) => (
                <tr key={row.variantId}>
                  <td className="font-mono text-xs">{row.sku}</td>
                  <td>{row.productName}</td>
                  <td
                    className={`text-right font-semibold ${row.availableQuantity === 0 ? 'text-red-600' : 'text-amber-600'}`}
                  >
                    {row.availableQuantity}
                  </td>
                </tr>
              ))}
              {stats.lowStockVariants.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-gray-400">
                    <T id="ui.allGoodNothingRunningLow" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">
            <T id="ui.salesByDay14Days" />
          </h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="text-right">
                  <T id="ui.orders" />
                </th>
                <th className="text-right">
                  <T id="ui.revenue" />
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.salesByDay.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td className="text-right">{row.orderCount}</td>
                  <td className="text-right font-medium">{money(row.revenueMinor)}</td>
                </tr>
              ))}
              {stats.salesByDay.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-gray-400">
                    <T id="ui.noSalesYet" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">
            <T id="ui.salesByBrandAmpCampaign" />
          </h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th className="text-right">Units</th>
                <th className="text-right">
                  <T id="ui.revenue" />
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.salesByBrand.map((row) => (
                <tr key={row.brandName}>
                  <td>{row.brandName}</td>
                  <td className="text-right">{row.unitsSold}</td>
                  <td className="text-right font-medium">{money(row.revenueMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.salesByCampaign.length > 0 ? (
            <table className="admin-table mt-4">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">
                    <T id="ui.revenue" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.salesByCampaign.map((row) => (
                  <tr key={row.campaignTitle}>
                    <td>{row.campaignTitle}</td>
                    <td className="text-right">{row.unitsSold}</td>
                    <td className="text-right font-medium">{money(row.revenueMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      </div>
    </div>
  );
}
