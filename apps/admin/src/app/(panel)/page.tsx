'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { DashboardStatsDto } from '@outlet/types';
import { formatMoney, formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';

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
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStatsDto>('/admin/dashboard'),
    refetchInterval: 60_000,
  });

  if (isLoading || !stats) return <p className="text-gray-500">Loading dashboard…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(stats.revenueMinor)} />
        <StatCard label="Orders" value={String(stats.orderCount)} href="/orders" />
        <StatCard label="Avg. order value" value={formatMoney(stats.averageOrderValueMinor)} />
        <StatCard label="Low stock SKUs" value={String(stats.lowStockCount)} href="/inventory" />
        <StatCard
          label="Active reservations"
          value={String(stats.activeReservationCount)}
          href="/reservations"
        />
        <StatCard label="Expired reservations" value={String(stats.expiredReservationCount)} />
        <StatCard label="Failed payments" value={String(stats.failedPaymentCount)} />
        <StatCard label="Open returns" value={String(stats.openReturnCount)} href="/returns" />
        <StatCard
          label="Active campaigns"
          value={String(stats.activeCampaignCount)}
          href="/campaigns"
        />
        <StatCard
          label="Upcoming campaigns"
          value={String(stats.upcomingCampaignCount)}
          href="/campaigns"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Recent orders</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
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
                  <td className="text-right font-medium">{formatMoney(order.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Low stock</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
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
                    All good — nothing running low.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Sales by day (14 days)</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {stats.salesByDay.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td className="text-right">{row.orderCount}</td>
                  <td className="text-right font-medium">{formatMoney(row.revenueMinor)}</td>
                </tr>
              ))}
              {stats.salesByDay.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-gray-400">
                    No sales yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Sales by brand &amp; campaign</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th className="text-right">Units</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {stats.salesByBrand.map((row) => (
                <tr key={row.brandName}>
                  <td>{row.brandName}</td>
                  <td className="text-right">{row.unitsSold}</td>
                  <td className="text-right font-medium">{formatMoney(row.revenueMinor)}</td>
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
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.salesByCampaign.map((row) => (
                  <tr key={row.campaignTitle}>
                    <td>{row.campaignTitle}</td>
                    <td className="text-right">{row.unitsSold}</td>
                    <td className="text-right font-medium">{formatMoney(row.revenueMinor)}</td>
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
