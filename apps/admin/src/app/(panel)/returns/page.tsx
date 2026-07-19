'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReturnRequestDto } from '@outlet/types';
import { formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';

const STATUSES = ['', 'REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'COMPLETED', 'CANCELLED'];
const TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  REQUESTED: 'yellow', APPROVED: 'blue', REJECTED: 'red',
  RECEIVED: 'blue', COMPLETED: 'green', CANCELLED: 'gray',
};

export default function ReturnsAdminPage() {
  const [status, setStatus] = useState('');
  const { data: returns } = useQuery({
    queryKey: ['admin-returns', status],
    queryFn: () =>
      api.get<ReturnRequestDto[]>(`/admin/returns${status ? `?status=${status}` : ''}`),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Return requests</h1>
      <div className="mb-4 flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              status === s ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr><th>RMA</th><th>Order</th><th>Status</th><th>Reason</th><th>Items</th><th>Created</th></tr>
          </thead>
          <tbody>
            {(returns ?? []).map((request) => (
              <tr key={request.id}>
                <td>
                  <Link href={`/returns/${request.id}`} className="font-medium hover:underline" data-testid={`return-${request.rmaNumber}`}>
                    {request.rmaNumber}
                  </Link>
                </td>
                <td>{request.orderNumber}</td>
                <td><Badge tone={TONE[request.status]}>{request.status}</Badge></td>
                <td className="text-gray-500">{request.reason}</td>
                <td>{request.items.reduce((s, i) => s + i.quantity, 0)}</td>
                <td className="text-xs text-gray-500">{formatDate(request.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
