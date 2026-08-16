'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InventoryRowDto, InventoryMovementDto } from '@outlet/types';
import { api, API_BASE_URL, ApiError } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

export default function InventoryPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [adjusting, setAdjusting] = useState<InventoryRowDto | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'RESTOCK', quantity: 1, reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [showMovements, setShowMovements] = useState(false);

  const { data } = useQuery({
    queryKey: ['admin-inventory', q],
    queryFn: () =>
      api.get<{ items: InventoryRowDto[] }>(
        `/admin/inventory?page=1&pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });
  const { data: movements } = useQuery({
    queryKey: ['admin-movements'],
    queryFn: () =>
      api.get<{ items: InventoryMovementDto[] }>('/admin/inventory/movements?page=1&pageSize=50'),
    enabled: showMovements,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
    queryClient.invalidateQueries({ queryKey: ['admin-movements'] });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex gap-2">
          <a
            href={`${API_BASE_URL}/admin/inventory/export/csv`}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            <T id="ui.exportCsv" />
          </a>
          <Link
            href="/reservations"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            <T id="ui.viewReservations" />
          </Link>
          <button
            type="button"
            onClick={() => setShowMovements((s) => !s)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            {showMovements ? 'Hide movements' : 'Show movements'}
          </button>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('ui.searchBySkuProduct')}
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>
                <T id="ui.product" />
              </th>
              <th className="text-right">
                <T id="ui.hand" />
              </th>
              <th className="text-right">Reserved</th>
              <th className="text-right">Available</th>
              <th className="text-right">Sold</th>
              <th className="text-right">Damaged</th>
              <th className="text-right">Returned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.variantId}>
                <td className="font-mono text-xs">{row.sku}</td>
                <td>
                  {row.productName}
                  <span className="block text-xs text-gray-400">
                    {row.brandName} · {row.size ?? '—'} {row.color ?? ''}
                  </span>
                </td>
                <td className="text-right">{row.onHandQuantity}</td>
                <td className="text-right">{row.reservedQuantity}</td>
                <td
                  className={`text-right font-semibold ${row.availableQuantity === 0 ? 'text-red-600' : ''}`}
                >
                  {row.availableQuantity}
                </td>
                <td className="text-right text-gray-500">{row.soldQuantity}</td>
                <td className="text-right text-gray-500">{row.damagedQuantity}</td>
                <td className="text-right text-gray-500">{row.returnedQuantity}</td>
                <td className="text-right">
                  <button
                    type="button"
                    data-testid={`adjust-${row.sku}`}
                    onClick={() => {
                      setAdjusting(row);
                      setAdjustForm({ type: 'RESTOCK', quantity: 1, reason: '' });
                      setError(null);
                    }}
                    className="text-xs font-medium text-gray-600 underline"
                  >
                    Adjust
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjusting ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="font-semibold">
              <T id="ui.adjustStock" />
              <span className="font-mono text-sm">{adjusting.sku}</span>
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              On hand {adjusting.onHandQuantity}, reserved {adjusting.reservedQuantity}.
            </p>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                try {
                  await api.post('/admin/inventory/adjust', {
                    variantId: adjusting.variantId,
                    type: adjustForm.type,
                    quantity: adjustForm.quantity,
                    reason: adjustForm.reason,
                  });
                  setAdjusting(null);
                  refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Adjustment failed.');
                }
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Type</span>
                <select
                  value={adjustForm.type}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  data-testid="adjust-type"
                >
                  <option value="RESTOCK">
                    <T id="ui.restockAddUnits" />
                  </option>
                  <option value="ADJUSTMENT_INCREASE">
                    <T id="ui.adjustmentIncrease" />
                  </option>
                  <option value="ADJUSTMENT_DECREASE">
                    <T id="ui.adjustmentDecrease" />
                  </option>
                  <option value="CORRECTION">
                    <T id="ui.correctionSetAbsoluteHand" />
                  </option>
                  <option value="DAMAGED">
                    <T id="ui.markDamaged" />
                  </option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  {adjustForm.type === 'CORRECTION' ? 'New on-hand quantity' : 'Quantity'}
                </span>
                <input
                  type="number"
                  min={0}
                  value={adjustForm.quantity}
                  onChange={(e) =>
                    setAdjustForm((f) => ({ ...f, quantity: Number(e.target.value) }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  data-testid="adjust-quantity"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  <T id="ui.reasonRequiredAudited" />
                </span>
                <input
                  required
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  data-testid="adjust-reason"
                />
              </label>
              <div className="flex gap-3">
                <button
                  data-testid="adjust-submit"
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  <T id="ui.applyAdjustment" />
                </button>
                <button
                  type="button"
                  onClick={() => setAdjusting(null)}
                  className="text-sm text-gray-500 underline"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showMovements ? (
        <section className="mt-8 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 font-semibold">
            <T id="ui.recentMovements" />
          </h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>SKU</th>
                <th>Type</th>
                <th className="text-right">Change</th>
                <th className="text-right">
                  <T id="ui.beforeAfter" />
                </th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {(movements?.items ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="text-xs text-gray-500">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                  <td className="font-mono text-xs">{m.sku}</td>
                  <td>{m.type}</td>
                  <td
                    className={`text-right font-semibold ${m.quantityChange < 0 ? 'text-red-600' : 'text-green-700'}`}
                  >
                    {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                  </td>
                  <td className="text-right text-gray-500">
                    {m.previousOnHand} → {m.newOnHand}
                  </td>
                  <td className="text-gray-500">{m.reason}</td>
                  <td className="text-xs text-gray-400">{m.actorEmail ?? 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
