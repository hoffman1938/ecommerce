'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProductReviewsDto } from '@outlet/types';
import { Skeleton, StarRating, cx } from '@outlet/ui';
import { api } from '@/lib/api';

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'helpful', label: 'Most helpful' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
] as const;

const PAGE_SIZE = 5;

function relativeDate(iso: string): string {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Reviews block for the product page.
 *
 * The summary comes from the server-rendered product so the rating is in the
 * initial HTML, while the list itself is fetched client-side — sorting and
 * paging are interactions, not page loads.
 *
 * `reviewCount` counts every rating, but only reviews with written text are
 * returned as rows. That gap is deliberate and mirrors real catalogues: most
 * customers rate, few write. The copy says so rather than leaving the reader to
 * wonder why 40 reviews show 8 comments.
 */
export function ProductReviews({
  slug,
  ratingAverage,
  reviewCount,
}: {
  slug: string;
  ratingAverage: number | null;
  reviewCount: number;
}) {
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('recent');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', slug, sort, page],
    queryFn: () =>
      api.get<ProductReviewsDto>(
        `/catalog/products/${slug}/reviews?sort=${sort}&page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    enabled: reviewCount > 0,
    staleTime: 60_000,
  });

  if (reviewCount === 0 || ratingAverage === null) {
    return (
      <section id="reviews" className="mt-14 border-t border-ink-200 pt-8 lg:mt-20">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-ink-950">Reviews</h2>
        <p className="mt-3 max-w-md text-sm text-ink-600">
          No reviews yet. This is a recent addition to the outlet — check the size and materials in
          the details above, and our 30-day returns apply either way.
        </p>
      </section>
    );
  }

  const totalPages = data?.totalPages ?? 1;

  return (
    <section id="reviews" className="mt-14 border-t border-ink-200 pt-8 lg:mt-20">
      <h2 className="text-xl font-bold tracking-[-0.02em] text-ink-950">Reviews</h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-14">
        {/* Summary + histogram */}
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:h-fit">
          <div className="flex items-baseline gap-2.5">
            <span data-numeric className="text-4xl font-bold tracking-[-0.03em] text-ink-950">
              {ratingAverage.toFixed(1)}
            </span>
            <span className="text-sm text-ink-500">out of 5</span>
          </div>
          <StarRating value={ratingAverage} size="lg" className="mt-2" />
          <p data-numeric className="mt-2 text-sm text-ink-600">
            {reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'}
            {data ? ` · ${data.total} written` : null}
          </p>
          {data && data.verifiedCount > 0 ? (
            <p data-numeric className="mt-1 text-xs text-success-700">
              {data.verifiedCount} from verified purchases
            </p>
          ) : null}

          <dl className="mt-5 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = data?.distribution[String(star)] ?? 0;
              // Denominated by every rating, not just the written ones — the
              // histogram describes the full rating population.
              const percent = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2.5 text-xs">
                  <dt data-numeric className="w-8 shrink-0 text-ink-600">
                    {star} ★
                  </dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-warning-600"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span data-numeric className="w-7 shrink-0 text-right text-ink-500">
                      {count}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-4 text-2xs leading-relaxed text-ink-400">
            The histogram covers all {reviewCount} ratings. Most customers rate without leaving a
            written review.
          </p>
        </div>

        {/* List */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-4 border-b border-ink-200 pb-3">
            <label htmlFor="review-sort" className="text-sm text-ink-600">
              Sort by
            </label>
            <select
              id="review-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as (typeof SORTS)[number]['value']);
                setPage(1);
              }}
              className="h-9 rounded bg-ink-25 px-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 transition-shadow hover:ring-ink-400"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <ul className="divide-y divide-ink-100">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="space-y-2 py-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-full" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(data?.items ?? []).map((review) => (
                <li key={review.id} className="py-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating value={review.rating} size="sm" />
                    {review.title ? (
                      <h3 className="text-sm font-semibold text-ink-950">{review.title}</h3>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{review.body}</p>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                    <span>{review.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <span data-numeric>{relativeDate(review.createdAt)}</span>
                    {review.isVerifiedPurchase ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-success-700">Verified purchase</span>
                      </>
                    ) : null}
                    {review.helpfulCount > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span data-numeric>{review.helpfulCount} found this helpful</span>
                      </>
                    ) : null}
                  </p>

                  {/* Shop response, written in the admin panel. Indented and
                      tinted so it reads as a reply rather than a second review
                      competing with the customer's. */}
                  {review.adminReply ? (
                    <div className="mt-3 border-l-2 border-ink-300 bg-ink-50 py-3 pl-4 pr-3">
                      <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
                        Response from Outlet
                        {review.adminReplyAt ? (
                          <>
                            {' '}
                            <span aria-hidden="true">·</span>{' '}
                            <span data-numeric className="font-normal normal-case tracking-normal">
                              {relativeDate(review.adminReplyAt)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
                        {review.adminReply}
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="mt-5 flex items-center justify-between gap-4 border-t border-ink-200 pt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cx(
                  'text-sm underline underline-offset-2 transition-colors',
                  page <= 1 ? 'cursor-not-allowed text-ink-300' : 'text-ink-600 hover:text-ink-950',
                )}
              >
                Previous
              </button>
              <span data-numeric className="text-sm text-ink-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={cx(
                  'text-sm underline underline-offset-2 transition-colors',
                  page >= totalPages
                    ? 'cursor-not-allowed text-ink-300'
                    : 'text-ink-600 hover:text-ink-950',
                )}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
