'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

const STATUSES = [
  '',
  'AWAITING_PAYMENT',
  'PAID',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'PARTIALLY_RETURNED',
  'RETURNED',
];

interface OrderSummary {
  byStatus: Array<{ status: string; count: number; totalMinor: number }>;
  totalMinor: number;
  count: number;
  soldMinor: number;
  soldCount: number;
}

const statusTone = (status: string) =>
  status === 'CANCELLED' || status === 'RETURNED'
    ? 'red'
    : status === 'DELIVERED'
      ? 'green'
      : 'blue';

export default function OrdersAdminPage() {
  const { t, money } = useI18n();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, OrderDto>>({});

  const query = [
    `page=${page}`,
    'pageSize=25',
    q ? `q=${encodeURIComponent(q)}` : '',
    status ? `status=${status}` : '',
    from ? `from=${from}` : '',
    to ? `to=${to}` : '',
  ]
    .filter(Boolean)
    .join('&');

  const { data } = useQuery({
    queryKey: ['admin-orders', query],
    queryFn: () =>
      api.get<{ items: OrderDto[]; totalPages: number; total: number; summary: OrderSummary }>(
        `/admin/orders?${query}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = data?.items ?? [];
  const selectedOrders = Object.values(selected);
  const allOnPageSelected = rows.length > 0 && rows.every((o) => selected[o.id]);

  const reset = () => {
    setPage(1);
    // Selection is deliberately kept across filter changes: picking a few
    // cancelled orders, then a few delivered ones, and reading the combined
    // figure is the whole point of totalling a selection.
  };

  const toggle = (order: OrderDto) =>
    setSelected((current) => {
      const next = { ...current };
      if (next[order.id]) delete next[order.id];
      else next[order.id] = order;
      return next;
    });

  const toggleAllOnPage = () =>
    setSelected((current) => {
      const next = { ...current };
      if (allOnPageSelected) for (const o of rows) delete next[o.id];
      else for (const o of rows) next[o.id] = o;
      return next;
    });

  /** The selection broken down the same way the filtered set is. */
  const selectedByStatus = selectedOrders.reduce<Record<string, { count: number; total: number }>>(
    (acc, order) => {
      const bucket = (acc[order.status] ??= { count: 0, total: 0 });
      bucket.count += 1;
      bucket.total += order.totalMinor;
      return acc;
    },
    {},
  );
  const selectedTotal = selectedOrders.reduce((sum, o) => sum + o.totalMinor, 0);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Orders</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            reset();
          }}
          placeholder={t('ui.searchOrderNumberEmail')}
          className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            reset();
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
        <label className="text-xs text-gray-500">
          <span className="mb-1 block">
            <T id="ui.placedFrom" />
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              reset();
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-gray-500">
          <span className="mb-1 block">
            <T id="ui.placedTo" />
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              reset();
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {from || to || status || q ? (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setStatus('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="px-1 py-2 text-sm text-gray-500 underline"
          >
            <T id="ui.clear" />
          </button>
        ) : null}
      </div>

      {/* Totals for everything the filter matches, not for the 25 rows below. */}
      {data?.summary ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span>
              <span className="text-xs uppercase tracking-wide text-gray-500">
                <T id="ui.sold" />
              </span>
              <span className="ml-2 text-lg font-bold">{money(data.summary.soldMinor)}</span>
              <span className="ml-1.5 text-sm text-gray-500">
                {t('ui.acrossOrders', { count: data.summary.soldCount })}
              </span>
            </span>
            <span className="text-sm text-gray-500">
              <T id="ui.allMatching" />{' '}
              <span className="font-medium text-gray-700">{money(data.summary.totalMinor)}</span>{' '}
              {t('ui.acrossOrders', { count: data.summary.count })}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            <T id="ui.soldExcludesCancelled" />
          </p>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {data.summary.byStatus.map((row) => (
              <button
                key={row.status}
                type="button"
                onClick={() => {
                  setStatus(row.status === status ? '' : row.status);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  status === row.status
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {row.status} · {row.count} · {money(row.totalMinor)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* The selection's own totals, which is what mixing statuses is for. */}
      {selectedOrders.length > 0 ? (
        <div className="mb-4 rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="text-lg font-bold">{money(selectedTotal)}</span>
            <span className="text-sm text-gray-300">
              {t('ui.selectedOrders', { count: selectedOrders.length })}
            </span>
            <button
              type="button"
              onClick={() => setSelected({})}
              className="text-sm text-gray-300 underline hover:text-white"
            >
              <T id="ui.clearSelection" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
            {Object.entries(selectedByStatus)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => (
                <span key={key}>
                  <span className="font-medium text-white">{key}</span> · {value.count} ·{' '}
                  {money(value.total)}
                </span>
              ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label={t('ui.selectAllOnPage')}
                  className="h-4 w-4"
                />
              </th>
              <th>
                <T id="ui.order" />
              </th>
              <th>
                <T id="ui.customer" />
              </th>
              <th>
                <T id="ui.status" />
              </th>
              <th>
                <T id="ui.payment" />
              </th>
              <th className="text-right">
                <T id="ui.total" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id} className={selected[order.id] ? 'bg-gray-50' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[order.id])}
                    onChange={() => toggle(order)}
                    aria-label={`${t('ui.select')} ${order.orderNumber}`}
                    className="h-4 w-4"
                  />
                </td>
                <td>
                  <Link
                    href={`/orders/view?id=${order.id}`}
                    className="font-medium hover:underline"
                    data-testid={`order-${order.orderNumber}`}
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="block text-xs text-gray-400">{formatDate(order.placedAt)}</span>
                </td>
                <td className="text-gray-500">{order.email}</td>
                <td>
                  <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                </td>
                <td>
                  {order.payments[0] ? (
                    <Badge
                      tone={
                        order.payments[0].status === 'PAID'
                          ? 'green'
                          : order.payments[0].status === 'FAILED'
                            ? 'red'
                            : 'gray'
                      }
                    >
                      {order.payments[0].status}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-right font-medium">{money(order.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border px-3 py-1.5 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-gray-500">
            Page {page} / {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1.5 disabled:opacity-40"
          >
            <T id="ui.next2" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
