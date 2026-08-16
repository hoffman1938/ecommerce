'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@outlet/ui';
import { api } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ['admin-audit', search, page],
    queryFn: () =>
      api.get<{ items: AuditRow[]; total: number; totalPages: number }>(
        `/admin/audit-logs?page=${page}&pageSize=50${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
    placeholderData: (previous) => previous,
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">
        <T id="ui.auditLogs" />
      </h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t('ui.searchLogsPlaceholder')}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        {search ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPage(1);
            }}
            className="text-sm text-gray-500 underline"
          >
            <T id="ui.clear" />
          </button>
        ) : null}
        <span className="text-sm text-gray-500">
          {isFetching ? t('ui.searching') : t('ui.entriesFound', { count: data?.total ?? 0 })}
        </span>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        <T id="ui.searchLogsHint" />
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap text-xs text-gray-500">
                  {formatDate(row.createdAt)}
                </td>
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
