'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, EmptyState, Skeleton, StarRating, cx, formatDate } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { useAdminUser, hasPermission } from '@/lib/hooks';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';

type ReviewStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  helpfulCount: number;
  adminReply: string | null;
  adminReplyAt: string | null;
  reportCount: number;
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
  product: { id: string; name: string; slug: string };
  user: { id: string; email: string } | null;
  adminReplyBy: { id: string; email: string } | null;
  moderatedBy: { id: string; email: string } | null;
}

interface ReviewPage {
  items: ReviewRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ReviewStats {
  statusCounts: Record<ReviewStatus, number>;
  distribution: Record<string, number>;
  reported: number;
  unanswered: number;
  publishedCount: number;
  ratingAverage: number | null;
}

const STATUS_TABS: Array<{ key: ReviewStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'HIDDEN', label: 'Hidden' },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
  { value: 'reported', label: 'Most reported' },
  { value: 'helpful', label: 'Most helpful' },
];

const STATUS_TONE: Record<ReviewStatus, 'green' | 'yellow' | 'red' | 'gray'> = {
  PUBLISHED: 'green',
  PENDING: 'yellow',
  REJECTED: 'red',
  HIDDEN: 'gray',
};

/** Bulk action -> the status it produces, for the optimistic undo payload. */
const ACTION_STATUS: Record<string, ReviewStatus> = {
  publish: 'PUBLISHED',
  reject: 'REJECTED',
  hide: 'HIDDEN',
  pending: 'PENDING',
};

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: me } = useAdminUser();

  const canModerate = hasPermission(me?.user, 'reviews.moderate');
  const canReply = hasPermission(me?.user, 'reviews.reply');
  const canDelete = hasPermission(me?.user, 'reviews.delete');

  const [status, setStatus] = useState<ReviewStatus | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [rating, setRating] = useState('');
  const [verified, setVerified] = useState('');
  const [reported, setReported] = useState(false);
  const [replied, setReplied] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  // Any filter change invalidates the current page number and the selection —
  // keeping either would act on rows that are no longer on screen.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [status, debouncedSearch, sort, rating, verified, reported, replied]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25', sort });
    if (status !== 'ALL') params.set('status', status);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (rating) params.set('rating', rating);
    if (verified) params.set('verified', verified);
    if (reported) params.set('reported', 'true');
    if (replied) params.set('replied', replied);
    return params.toString();
  }, [page, sort, status, debouncedSearch, rating, verified, reported, replied]);

  const listQuery = useQuery({
    queryKey: ['admin-reviews', queryString],
    queryFn: () => api.get<ReviewPage>(`/admin/reviews?${queryString}`),
  });

  // Stats follow the same filters minus status, so the tab counts stay honest.
  const statsQuery = useQuery({
    queryKey: ['admin-review-stats', queryString],
    queryFn: () => api.get<ReviewStats>(`/admin/reviews/stats?${queryString}`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-review-stats'] });
  };

  const describeError = (error: unknown) =>
    error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';

  /**
   * `previous` rides along in the mutation variables purely so the success
   * toast can offer Undo — the API never sees it.
   */
  const setStatusMutation = useMutation<
    ReviewRow,
    unknown,
    { id: string; next: ReviewStatus; note?: string; previous?: ReviewStatus }
  >({
    mutationFn: ({ id, next, note }) =>
      api.post<ReviewRow>(`/admin/reviews/${id}/status`, { status: next, note }),
    onSuccess: (_row, variables) => {
      refresh();
      const { previous, id, next } = variables;
      toast.success(
        `Review moved to ${next.toLowerCase()}.`,
        previous && previous !== next
          ? {
              label: 'Undo',
              onClick: async () => {
                await api.post(`/admin/reviews/${id}/status`, { status: previous });
                refresh();
                toast.info('Change reverted.');
              },
            }
          : undefined,
      );
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const bulkMutation = useMutation<
    { count: number; ids: string[] },
    unknown,
    { ids: string[]; action: string; previous?: Record<string, ReviewStatus> }
  >({
    mutationFn: ({ ids, action }) =>
      api.post<{ count: number; ids: string[] }>('/admin/reviews/bulk', { ids, action }),
    onSuccess: (result, variables) => {
      refresh();
      setSelected(new Set());
      const previous = variables.previous;
      toast.success(
        `${result.count} review${result.count === 1 ? '' : 's'} updated.`,
        // Only status transitions are reversible; delete and clearReports are not.
        previous
          ? {
              label: 'Undo',
              onClick: async () => {
                // Restore each row to the status it actually held before.
                await Promise.all(
                  Object.entries(previous).map(([id, prev]) =>
                    api.post(`/admin/reviews/${id}/status`, { status: prev }),
                  ),
                );
                refresh();
                toast.info('Bulk change reverted.');
              },
            }
          : undefined,
      );
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reviews/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Review deleted.');
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const items = listQuery.data?.items ?? [];
  const stats = statsQuery.data;

  const allOnPageSelected = items.length > 0 && items.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allOnPageSelected ? new Set() : new Set(items.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const previousStatuses = (ids: string[]): Record<string, ReviewStatus> =>
    Object.fromEntries(
      items.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.status] as const),
    );

  const runBulk = async (action: string) => {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (action === 'delete') {
      const ok = await confirm({
        title: `Delete ${ids.length} review${ids.length === 1 ? '' : 's'}?`,
        description:
          'This permanently removes the reviews and recalculates the affected product ratings. It cannot be undone.',
        confirmLabel: 'Delete permanently',
        tone: 'danger',
        requireTyped: ids.length > 5 ? 'DELETE' : undefined,
      });
      if (!ok) return;
    }

    bulkMutation.mutate({
      ids,
      action,
      previous: ACTION_STATUS[action] ? previousStatuses(ids) : undefined,
    });
  };

  const removeOne = async (review: ReviewRow) => {
    const ok = await confirm({
      title: 'Delete this review?',
      description: (
        <>
          <span className="block">
            “{review.title || review.body.slice(0, 80)}” by {review.authorName}
          </span>
          <span className="mt-2 block">
            The product rating will be recalculated. This cannot be undone — hide it instead if you
            may want it back.
          </span>
        </>
      ),
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (ok) deleteMutation.mutate(review.id);
  };

  return (
    <div>
      {dialog}

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reviews</h1>
          <p className="mt-1 text-sm text-gray-500">
            Moderate customer reviews and respond as the shop. Published reviews are the only ones
            visible on the storefront.
          </p>
        </div>
        {stats ? (
          <div className="flex items-center gap-5 text-sm">
            <Stat
              label="Average"
              value={stats.ratingAverage ? stats.ratingAverage.toFixed(2) : '—'}
            />
            <Stat label="Published" value={String(stats.publishedCount)} />
            <Stat label="Reported" value={String(stats.reported)} tone={stats.reported > 0} />
            <Stat label="Unanswered" value={String(stats.unanswered)} />
          </div>
        ) : null}
      </header>

      {stats ? <RatingHistogram distribution={stats.distribution} /> : null}

      {/* Status tabs, each carrying its own count. */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === 'ALL'
              ? Object.values(stats?.statusCounts ?? {}).reduce((a, b) => a + b, 0)
              : (stats?.statusCounts?.[tab.key] ?? 0);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={cx(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                status === tab.key
                  ? 'border-gray-900 font-semibold text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-900',
              )}
            >
              {tab.label}
              {stats ? <span className="ml-1.5 text-xs text-gray-400">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search review text, author or product…"
          className="h-9 min-w-64 flex-1 rounded-md border border-gray-300 px-3 text-sm"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort reviews"
          className="h-9 rounded-md border border-gray-300 px-2 text-sm"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={rating}
          onChange={(event) => setRating(event.target.value)}
          aria-label="Filter by rating"
          className="h-9 rounded-md border border-gray-300 px-2 text-sm"
        >
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} star{value === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <select
          value={verified}
          onChange={(event) => setVerified(event.target.value)}
          aria-label="Filter by verified purchase"
          className="h-9 rounded-md border border-gray-300 px-2 text-sm"
        >
          <option value="">Any purchase</option>
          <option value="true">Verified only</option>
          <option value="false">Unverified only</option>
        </select>
        <select
          value={replied}
          onChange={(event) => setReplied(event.target.value)}
          aria-label="Filter by reply state"
          className="h-9 rounded-md border border-gray-300 px-2 text-sm"
        >
          <option value="">Any reply state</option>
          <option value="false">Awaiting reply</option>
          <option value="true">Replied</option>
        </select>
        <label className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm">
          <input
            type="checkbox"
            checked={reported}
            onChange={(event) => setReported(event.target.checked)}
          />
          Reported only
        </label>
      </div>

      {/* Bulk action bar — only present when there is a selection to act on. */}
      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-gray-900 bg-gray-900 px-3 py-2 text-sm text-white">
          <span className="font-medium">{selected.size} selected</span>
          <span className="flex-1" />
          {canModerate ? (
            <>
              <BulkButton onClick={() => runBulk('publish')} busy={bulkMutation.isPending}>
                Publish
              </BulkButton>
              <BulkButton onClick={() => runBulk('hide')} busy={bulkMutation.isPending}>
                Hide
              </BulkButton>
              <BulkButton onClick={() => runBulk('reject')} busy={bulkMutation.isPending}>
                Reject
              </BulkButton>
              <BulkButton onClick={() => runBulk('clearReports')} busy={bulkMutation.isPending}>
                Clear reports
              </BulkButton>
            </>
          ) : null}
          {canDelete ? (
            <BulkButton onClick={() => runBulk('delete')} busy={bulkMutation.isPending} danger>
              Delete
            </BulkButton>
          ) : null}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-1 text-xs underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      ) : null}

      {listQuery.isError ? (
        <Alert tone="error" title="Could not load reviews">
          {describeError(listQuery.error)}{' '}
          <button type="button" onClick={() => listQuery.refetch()} className="underline">
            Retry
          </button>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {listQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reviews match these filters"
            description={
              status === 'PENDING'
                ? 'Nothing is waiting for moderation right now.'
                : 'Try widening the search or clearing a filter.'
            }
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus('ALL');
                  setSearch('');
                  setRating('');
                  setVerified('');
                  setReplied('');
                  setReported(false);
                }}
              >
                Clear all filters
              </Button>
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all reviews on this page"
                  />
                </th>
                <th>Review</th>
                <th>Product</th>
                <th>Status</th>
                <th>Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((review) => (
                <ReviewRowView
                  key={review.id}
                  review={review}
                  selected={selected.has(review.id)}
                  onToggle={() => toggleOne(review.id)}
                  expanded={expanded === review.id}
                  onExpand={() => setExpanded(expanded === review.id ? null : review.id)}
                  canModerate={canModerate}
                  canReply={canReply}
                  canDelete={canDelete}
                  onStatus={(next) =>
                    setStatusMutation.mutate({ id: review.id, next, previous: review.status })
                  }
                  onDelete={() => removeOne(review)}
                  onChanged={refresh}
                  onError={(message) => toast.error(message)}
                  onSuccess={(message) => toast.success(message)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {listQuery.data && listQuery.data.totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Page {listQuery.data.page} of {listQuery.data.totalPages} · {listQuery.data.total} review
            {listQuery.data.total === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= listQuery.data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cx('text-lg font-semibold', tone ? 'text-red-600' : 'text-gray-900')}>{value}</p>
    </div>
  );
}

function RatingHistogram({ distribution }: { distribution: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <div className="mb-5 flex items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[String(star)] ?? 0;
        return (
          <div key={star} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs text-gray-500">{count}</span>
            <div className="flex h-16 w-full items-end rounded bg-gray-100">
              <div
                className="w-full rounded bg-gray-900 transition-[height]"
                style={{ height: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-600">{star}★</span>
          </div>
        );
      })}
    </div>
  );
}

function BulkButton({
  children,
  onClick,
  busy,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cx(
        'rounded px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
        danger ? 'bg-red-600 hover:bg-red-500' : 'bg-white/15 hover:bg-white/25',
      )}
    >
      {children}
    </button>
  );
}

function ReviewRowView({
  review,
  selected,
  onToggle,
  expanded,
  onExpand,
  canModerate,
  canReply,
  canDelete,
  onStatus,
  onDelete,
  onChanged,
  onError,
  onSuccess,
}: {
  review: ReviewRow;
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
  canModerate: boolean;
  canReply: boolean;
  canDelete: boolean;
  onStatus: (next: ReviewStatus) => void;
  onDelete: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  return (
    <>
      <tr className={cx(selected && 'bg-gray-50')}>
        <td>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select review by ${review.authorName}`}
          />
        </td>
        <td className="max-w-md">
          <div className="flex items-center gap-2">
            <StarRating value={review.rating} size="sm" />
            {review.title ? (
              <span className="truncate font-medium text-gray-900">{review.title}</span>
            ) : null}
            {review.reportCount > 0 ? (
              <Badge tone="red">{review.reportCount} reported</Badge>
            ) : null}
            {review.adminReply ? <Badge tone="gray">Replied</Badge> : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{review.body}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            {review.authorName}
            {review.isVerifiedPurchase ? ' · Verified' : ''}
            {review.user ? ` · ${review.user.email}` : ' · Guest'}
          </p>
        </td>
        <td className="text-xs">
          <Link href={`/products/${review.product.id}`} className="hover:underline">
            {review.product.name}
          </Link>
        </td>
        <td>
          <Badge tone={STATUS_TONE[review.status]}>{review.status}</Badge>
        </td>
        <td className="whitespace-nowrap text-xs text-gray-500">{formatDate(review.createdAt)}</td>
        <td>
          <div className="flex justify-end gap-1">
            {canModerate && review.status !== 'PUBLISHED' ? (
              <RowButton onClick={() => onStatus('PUBLISHED')}>Publish</RowButton>
            ) : null}
            {canModerate && review.status === 'PUBLISHED' ? (
              <RowButton onClick={() => onStatus('HIDDEN')}>Hide</RowButton>
            ) : null}
            {canModerate && review.status !== 'REJECTED' ? (
              <RowButton onClick={() => onStatus('REJECTED')}>Reject</RowButton>
            ) : null}
            <RowButton onClick={onExpand}>{expanded ? 'Close' : 'Open'}</RowButton>
            {canDelete ? (
              <RowButton onClick={onDelete} danger>
                Delete
              </RowButton>
            ) : null}
          </div>
        </td>
      </tr>

      {expanded ? (
        <tr>
          <td colSpan={6} className="bg-gray-50">
            <ReviewDetail
              review={review}
              canModerate={canModerate}
              canReply={canReply}
              onChanged={onChanged}
              onError={onError}
              onSuccess={onSuccess}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RowButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded border px-2 py-1 text-xs font-medium transition-colors',
        danger
          ? 'border-red-200 text-red-600 hover:bg-red-50'
          : 'border-gray-300 text-gray-700 hover:bg-gray-100',
      )}
    >
      {children}
    </button>
  );
}

/** Expanded row: full text, inline edit, and the shop reply composer. */
function ReviewDetail({
  review,
  canModerate,
  canReply,
  onChanged,
  onError,
  onSuccess,
}: {
  review: ReviewRow;
  canModerate: boolean;
  canReply: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [title, setTitle] = useState(review.title ?? '');
  const [body, setBody] = useState(review.body);
  const [reply, setReply] = useState(review.adminReply ?? '');
  const [saving, setSaving] = useState(false);
  const [replying, setReplying] = useState(false);

  const dirty = title !== (review.title ?? '') || body !== review.body;
  const replyDirty = reply.trim() !== (review.adminReply ?? '');

  const describe = (error: unknown) =>
    error instanceof ApiError ? error.message : 'Something went wrong.';

  const save = async () => {
    if (body.trim().length === 0) {
      onError('Review text cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/admin/reviews/${review.id}`, { title: title || null, body });
      onChanged();
      onSuccess('Review updated.');
    } catch (error) {
      onError(describe(error));
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async () => {
    if (reply.trim().length === 0) {
      onError('Reply cannot be empty.');
      return;
    }
    setReplying(true);
    try {
      await api.post(`/admin/reviews/${review.id}/reply`, { body: reply.trim() });
      onChanged();
      onSuccess('Reply published.');
    } catch (error) {
      onError(describe(error));
    } finally {
      setReplying(false);
    }
  };

  const removeReply = async () => {
    setReplying(true);
    try {
      await api.delete(`/admin/reviews/${review.id}/reply`);
      setReply('');
      onChanged();
      onSuccess('Reply withdrawn.');
    } catch (error) {
      onError(describe(error));
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Review content
        </h3>
        {canModerate ? (
          <>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Review title (optional)"
              className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
                Save changes
              </Button>
              {dirty ? <span className="text-xs text-gray-500">Unsaved changes</span> : null}
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-gray-700">{review.body}</p>
        )}

        {review.moderationNote ? (
          <p className="mt-3 rounded border border-gray-200 bg-white p-2 text-xs text-gray-600">
            <span className="font-semibold">Moderation note:</span> {review.moderationNote}
            {review.moderatedBy ? ` — ${review.moderatedBy.email}` : ''}
            {review.moderatedAt ? ` (${formatDate(review.moderatedAt)})` : ''}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Shop response
        </h3>
        {canReply ? (
          <>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={5}
              placeholder="Reply publicly as the shop. This appears under the review on the storefront."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={submitReply} loading={replying} disabled={!replyDirty}>
                {review.adminReply ? 'Update reply' : 'Publish reply'}
              </Button>
              {review.adminReply ? (
                <Button size="sm" variant="secondary" onClick={removeReply} disabled={replying}>
                  Withdraw
                </Button>
              ) : null}
            </div>
            {review.adminReplyBy && review.adminReplyAt ? (
              <p className="mt-2 text-xs text-gray-400">
                Last replied by {review.adminReplyBy.email} on {formatDate(review.adminReplyAt)}
              </p>
            ) : null}
          </>
        ) : review.adminReply ? (
          <p className="whitespace-pre-wrap text-sm text-gray-700">{review.adminReply}</p>
        ) : (
          <p className="text-sm text-gray-400">No response yet.</p>
        )}
      </div>
    </div>
  );
}
