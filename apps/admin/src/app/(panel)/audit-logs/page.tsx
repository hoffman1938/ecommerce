'use client';

import { Fragment, useState } from 'react';
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

interface AuditDetailRow extends AuditRow {
  before: unknown;
  after: unknown;
  ip: string | null;
}

/** `null` and objects rendered as something readable rather than "[object Object]". */
function present(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/**
 * What the entry actually changed.
 *
 * A field-by-field comparison rather than two JSON blobs side by side: a
 * campaign write carries eleven fields and typically one of them moved, and
 * finding that one by eye in two objects is the work this screen exists to
 * save. Fields that did not change are listed separately and collapsed, so the
 * record stays complete without burying the answer.
 */
function AuditDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const { data, isPending, isError } = useQuery({
    queryKey: ['admin-audit-entry', id],
    queryFn: () => api.get<AuditDetailRow>(`/admin/audit-logs/${id}`),
  });

  if (isPending) return <p className="text-xs text-gray-500">{t('ui.loading')}</p>;
  if (isError || !data) return <p className="text-xs text-red-600">{t('ui.auditEntryFailed')}</p>;

  const before = (data.before ?? {}) as Record<string, unknown>;
  const after = (data.after ?? {}) as Record<string, unknown>;
  const isRecord = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /*
   * A key missing from one side is not a change.
   *
   * `before` is the row as it stood, `after` is the payload the write carried,
   * and the two are not the same shape: a campaign update sends eleven fields
   * while the row has sixteen. Comparing the union marks `id`, `createdAt` and
   * `updatedAt` as "changed to undefined" on every single edit, which buries
   * the one field that really moved under five that did not. Only keys present
   * on both sides can have changed; a key only in `after` is genuinely new.
   */
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changed = keys.filter((key) => {
    if (!(key in after)) return false;
    if (!(key in before)) return true;
    return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  });
  const unchanged = keys.filter((key) => !changed.includes(key));

  return (
    <div className="space-y-3 text-xs">
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-gray-600">
        <dt className="font-medium text-gray-500">{t('ui.entityId')}</dt>
        <dd className="break-all font-mono">{data.entityId ?? '—'}</dd>
        <dt className="font-medium text-gray-500">{t('ui.ipAddress')}</dt>
        <dd className="font-mono">{data.ip ?? '—'}</dd>
      </dl>

      {!isRecord(data.before) && !isRecord(data.after) ? (
        <p className="text-gray-500">{t('ui.noPayloadRecorded')}</p>
      ) : changed.length === 0 ? (
        <p className="text-gray-500">{t('ui.noFieldsChanged')}</p>
      ) : (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="w-1/4 py-1 font-medium">{t('ui.field')}</th>
              <th className="w-3/8 py-1 font-medium">{t('ui.before')}</th>
              <th className="w-3/8 py-1 font-medium">{t('ui.after')}</th>
            </tr>
          </thead>
          <tbody>
            {changed.map((key) => (
              <tr key={key} className="align-top">
                <td className="py-1 pr-3 font-mono text-gray-700">{key}</td>
                <td className="break-words py-1 pr-3 text-red-700">{present(before[key])}</td>
                <td className="break-words py-1 text-green-700">{present(after[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unchanged.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-gray-500">
            {t('ui.unchangedFields', { count: unchanged.length })}
          </summary>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-gray-500">
            {unchanged.map((key) => (
              <Fragment key={key}>
                <dt className="font-mono">{key}</dt>
                <dd className="break-words">{present(after[key] ?? before[key])}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

export default function AuditLogsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [actorType, setActorType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['admin-audit', search, actorType, from, to, page],
    queryFn: () =>
      api.get<{ items: AuditRow[]; total: number; totalPages: number }>(
        `/admin/audit-logs?page=${page}&pageSize=50${search ? `&q=${encodeURIComponent(search)}` : ''}${
          actorType ? `&actorType=${actorType}` : ''
        }${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`,
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
        <select
          value={actorType}
          onChange={(e) => {
            setActorType(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t('ui.everyActor')}</option>
          <option value="ADMIN">ADMIN</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="SYSTEM">SYSTEM</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label={t('ui.placedFrom')}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          aria-label={t('ui.placedTo')}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        {search || actorType || from || to ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setActorType('');
              setFrom('');
              setTo('');
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
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <Fragment key={row.id}>
                <tr
                  onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
                  className="cursor-pointer hover:bg-gray-50"
                >
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
                  <td className="whitespace-nowrap text-right text-xs text-gray-400">
                    {openId === row.id ? '▾' : '▸'}
                  </td>
                </tr>
                {openId === row.id ? (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-4 py-3">
                      <AuditDetail id={row.id} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
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
