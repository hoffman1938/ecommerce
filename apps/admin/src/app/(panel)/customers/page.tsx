'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

interface CustomerRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'DISABLED';
  isEmailVerified: boolean;
  createdAt: string;
  _count: { orders: number };
}

export default function CustomersPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['admin-customers', q],
    queryFn: () =>
      api.get<{ items: CustomerRow[] }>(
        `/admin/customers?page=1&pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Customers</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('ui.searchByEmailName')}
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th><T id="ui.customer" /></th>
              <th><T id="ui.status" /></th>
              <th>Verified</th>
              <th className="text-right">Orders</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                    {customer.firstName} {customer.lastName}
                  </Link>
                  <span className="block text-xs text-gray-400">{customer.email}</span>
                </td>
                <td>
                  <Badge tone={customer.status === 'ACTIVE' ? 'green' : 'red'}>
                    {customer.status}
                  </Badge>
                </td>
                <td>{customer.isEmailVerified ? '✓' : '—'}</td>
                <td className="text-right">{customer._count.orders}</td>
                <td className="text-xs text-gray-500">{formatDate(customer.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
