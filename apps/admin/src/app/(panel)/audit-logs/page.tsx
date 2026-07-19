'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@outlet/ui';
import { api } from '@/lib/api';

interface AuditRow {
  id: string;
  actorEmail: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ['admin-audit', action, page],
    queryFn: () =>
      api.get<{ items: AuditRow[]; totalPages: number }>(
        `/admin/audit-logs?page=${page}&pageSize=50${action ? `&action=${encodeURIComponent(action)}` : ''}`,
      ),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Audit logs</h1>
      <input
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPage(1);
        }}
        placeholder="Filter by action (e.g. inventory, reservation, order)…"
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap text-xs text-gray-500">{formatDate(row.createdAt)}</td>
                <td className="text-xs">
                  {row.actorEmail ?? 'system'}
                  <span className="block text-gray-400">{row.actorType}</span>
                </td>
                <td className="font-mono text-xs">{row.action}</td>
                <td className="text-xs text-gray-500">
                  {row.entityType}
                  {row.entityId ? ` · ${row.entityId.slice(0, 12)}…` : ''}
                </td>
                <td className="text-xs text-gray-500">{row.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">← Prev</button>
          <span className="text-gray-500">Page {page} / {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next →</button>
        </div>
      ) : null}
    </div>
  );
}
