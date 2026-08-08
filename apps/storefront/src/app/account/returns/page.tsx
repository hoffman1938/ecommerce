'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReturnRequestDto } from '@outlet/types';
import { formatMoney, formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';

const TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  REQUESTED: 'yellow',
  APPROVED: 'blue',
  REJECTED: 'red',
  RECEIVED: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'gray',
};

export default function ReturnsPage() {
  const { data: returns, isLoading } = useQuery({
    queryKey: ['account-returns'],
    queryFn: () => api.get<ReturnRequestDto[]>('/account/returns'),
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Returns &amp; refunds</h1>
      <p className="mb-4 text-sm text-gray-500">
        Start a return from the order page of a shipped or delivered order.
      </p>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !returns || returns.length === 0 ? (
        <p className="text-gray-500">No return requests yet.</p>
      ) : (
        <div className="space-y-3">
          {returns.map((request) => (
            <div key={request.id} className="rounded-lg border border-gray-200 bg-ink-25 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {request.rmaNumber}{' '}
                  <span className="text-sm font-normal text-gray-500">
                    for order {request.orderNumber}
                  </span>
                </p>
                <Badge tone={TONE[request.status] ?? 'gray'}>{request.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {formatDate(request.createdAt)} · {request.reason}
              </p>
              <ul className="mt-2 text-sm text-gray-600">
                {request.items.map((item) => (
                  <li key={item.id}>
                    {item.name} × {item.quantity}
                  </li>
                ))}
              </ul>
              {request.refunds.length > 0 ? (
                <div className="mt-2 border-t border-gray-100 pt-2 text-sm">
                  {request.refunds.map((refund) => (
                    <p key={refund.id} className="text-gray-600">
                      Refund {formatMoney(refund.amountMinor)} ·{' '}
                      <Badge tone={refund.status === 'SUCCEEDED' ? 'green' : 'yellow'}>{refund.status}</Badge>
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
