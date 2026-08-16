'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

interface Coupon {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  minOrderMinor: number | null;
  maxDiscountMinor: number | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
}

const EMPTY = {
  code: '',
  type: 'PERCENTAGE' as 'FIXED' | 'PERCENTAGE',
  value: 10,
  minOrderMinor: '',
  maxDiscountMinor: '',
  firstOrderOnly: false,
  isActive: true,
};

export default function CouponsPage() {
  const { money } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { data: coupons } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: () => api.get<Coupon[]>('/admin/coupons'),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Coupons</h1>

      <form
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api.post('/admin/coupons', {
              code: form.code,
              type: form.type,
              value: Number(form.value),
              minOrderMinor: form.minOrderMinor ? Number(form.minOrderMinor) : null,
              maxDiscountMinor: form.maxDiscountMinor ? Number(form.maxDiscountMinor) : null,
              firstOrderOnly: form.firstOrderOnly,
              isActive: form.isActive,
            });
            setForm(EMPTY);
            queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Create failed.');
          }
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Code</span>
          <input
            required
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="w-36 rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs uppercase"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Type</span>
          <select
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value as 'FIXED' | 'PERCENTAGE' }))
            }
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">
              <T id="ui.fixedAmount" />
            </option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            {form.type === 'PERCENTAGE' ? 'Percent (1-100)' : 'Amount (minor units)'}
          </span>
          <input
            type="number"
            min={1}
            required
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
            className="w-28 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            <T id="ui.minOrderMinor" />
          </span>
          <input
            type="number"
            value={form.minOrderMinor}
            onChange={(e) => setForm((f) => ({ ...f, minOrderMinor: e.target.value }))}
            className="w-28 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            <T id="ui.maxDiscountMinor" />
          </span>
          <input
            type="number"
            value={form.maxDiscountMinor}
            onChange={(e) => setForm((f) => ({ ...f, maxDiscountMinor: e.target.value }))}
            className="w-28 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={form.firstOrderOnly}
            onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))}
          />
          <T id="ui.firstOrderOnly" />
        </label>
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700">
          <T id="ui.createCoupon" />
        </button>
        {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Rules</th>
              <th className="text-right">Used</th>
              <th>
                <T id="ui.status" />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(coupons ?? []).map((coupon) => (
              <tr key={coupon.id}>
                <td className="font-mono text-xs font-semibold">{coupon.code}</td>
                <td>
                  {coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : money(coupon.value)}
                  {coupon.maxDiscountMinor ? ` (max ${money(coupon.maxDiscountMinor)})` : ''}
                </td>
                <td className="text-xs text-gray-500">
                  {coupon.minOrderMinor ? `Min ${money(coupon.minOrderMinor)}. ` : ''}
                  {coupon.firstOrderOnly ? 'First order only.' : ''}
                </td>
                <td className="text-right">
                  {coupon.timesRedeemed}
                  {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}
                </td>
                <td>
                  <Badge tone={coupon.isActive ? 'green' : 'gray'}>
                    {coupon.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.put(`/admin/coupons/${coupon.id}`, {
                        code: coupon.code,
                        type: coupon.type,
                        value: coupon.value,
                        minOrderMinor: coupon.minOrderMinor,
                        maxDiscountMinor: coupon.maxDiscountMinor,
                        firstOrderOnly: coupon.firstOrderOnly,
                        isActive: !coupon.isActive,
                      });
                      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
                    }}
                    className="text-xs text-gray-500 underline"
                  >
                    {coupon.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
