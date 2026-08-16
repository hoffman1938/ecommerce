'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';
import { RoleEditor, type RoleEditorTarget } from '@/components/role-editor';

interface CustomerRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'DISABLED';
  isEmailVerified: boolean;
  createdAt: string;
  roles: string[];
  _count: { orders: number };
}

export default function CustomersPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<RoleEditorTarget | null>(null);
  const queryClient = useQueryClient();
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
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <T id="ui.customer" />
              </th>
              <th>
                <T id="ui.status" />
              </th>
              <th>Verified</th>
              <th className="text-right">Orders</th>
              <th>Joined</th>
              <th>
                <T id="ui.roles" />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link
                    href={`/customers/view?id=${customer.id}`}
                    className="font-medium hover:underline"
                  >
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
                <td className="text-xs">
                  {customer.roles.length > 0 ? (
                    <span className="font-medium text-gray-700">{customer.roles.join(', ')}</span>
                  ) : (
                    <span className="text-gray-400">{t('ui.customerNoRoles')}</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: customer.id,
                        email: customer.email,
                        name: `${customer.firstName} ${customer.lastName}`.trim(),
                        roles: customer.roles,
                      })
                    }
                    className="text-xs font-medium text-gray-700 underline hover:text-gray-900"
                  >
                    <T id="ui.manageRoles" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <RoleEditor
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      ) : null}
    </div>
  );
}
