'use client';

import type { Paginated, ProductListItemDto } from '@outlet/types';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, CloseIcon, EmptyState, cx } from '@outlet/ui';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { ProductGrid, ProductGridSkeleton } from './product-card';
import { Recommendations } from './recommendations';
import { ActiveFilters, FilterPanel, SortSelect, useFilters } from './filter-panel';

const ALLOWED_FILTERS = [
  'q',
  'category',
  'brand',
  'size',
  'color',
  'targetGroup',
  'campaign',
  'minPrice',
  'maxPrice',
  'minDiscount',
  'minRating',
  'inStock',
  'sort',
  'page',
];

/**
 * `useSearchParams()` returns ReadonlyURLSearchParams, which is deliberately
 * not assignable to URLSearchParams.
 */
type ReadableParams = { get(key: string): string | null };

function toQueryString(params: ReadableParams, fixed: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const key of ALLOWED_FILTERS) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  for (const [key, value] of Object.entries(fixed)) query.set(key, value);
  query.set('pageSize', '24');
  return query.toString();
}

/**
 * Catalog, category, brand and search listings.
 *
 * Filters read from the query string on the client rather than from
 * server-side `searchParams`, so the app can be exported statically for
 * Cloudflare Pages where there is no request-time render. The data call is
 * unchanged: `api` resolves it against the real API, or against the bundled
 * demo catalog when NEXT_PUBLIC_DEMO_MODE is set.
 */
function ProductListingInner({
  title,
  fixedFilters = {},
  basePath,
  titleFromQueryParam,
}: {
  title: string;
  fixedFilters?: Record<string, string>;
  basePath: string;
  titleFromQueryParam?: string;
}) {
  const searchParams = useSearchParams();
  const { activeCount } = useFilters();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryString = toQueryString(searchParams, fixedFilters);

  const term = titleFromQueryParam ? searchParams.get(titleFromQueryParam) : null;
  const resolvedTitle = term ? `“${term}”` : title;

  const {
    data: result,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['products', queryString],
    queryFn: () => api.get<Paginated<ProductListItemDto>>(`/catalog/products?${queryString}`),
  });

  // One search event per resolved result set, not per keystroke.
  useEffect(() => {
    if (!term || !result) return;
    track('search', { term, resultCount: result.total });
  }, [term, result]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const page = result?.page ?? 1;
  const buildPageLink = (target: number) => {
    const next = new URLSearchParams();
    for (const key of ALLOWED_FILTERS) {
      const value = searchParams.get(key);
      if (value && key !== 'page') next.set(key, value);
    }
    next.set('page', String(target));
    return `${basePath}?${next.toString()}`;
  };

  return (
    <div className="container-page py-6 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <h1 className="display text-4xl sm:text-5xl lg:text-6xl">
          {term ? (
            <span className="block text-base font-semibold uppercase tracking-[0.12em] text-ink-500">
              Results for
            </span>
          ) : null}
          {resolvedTitle}
        </h1>
        <p data-numeric className="pb-1.5 text-sm text-ink-500">
          {isPending ? 'Loading…' : `${result?.total ?? 0} products`}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        {/* Desktop facets. Sticky so long grids keep them reachable. */}
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--header-h)+2.5rem)] max-h-[calc(100vh-var(--header-h)-4rem)] overflow-y-auto py-8 pr-1">
            <FilterPanel />
          </div>
        </aside>

        <div className="min-w-0 pt-5 lg:pt-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              Filters
              {activeCount > 0 ? (
                <span
                  data-numeric
                  className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-950 px-1 text-[10px] font-semibold text-ink-25"
                >
                  {activeCount}
                </span>
              ) : null}
            </Button>
            <div className="ml-auto">
              <SortSelect />
            </div>
          </div>

          {/* Chips belong on every screen: on a phone they are the only way to
              see what is filtered without reopening the drawer. */}
          <ActiveFilters />

          {isError ? (
            <Alert tone="error" title="Could not load products">
              The catalog request failed. Check that the API is reachable and try again.
            </Alert>
          ) : isPending ? (
            <ProductGridSkeleton count={12} />
          ) : result && result.items.length > 0 ? (
            <>
              <ProductGrid products={result.items} priorityCount={4} />
              {result.totalPages > 1 ? (
                <Pagination
                  page={page}
                  totalPages={result.totalPages}
                  buildPageLink={buildPageLink}
                />
              ) : null}
            </>
          ) : (
            <NoResults />
          )}
        </div>
      </div>

      {drawerOpen ? (
        <FilterDrawer onClose={() => setDrawerOpen(false)} total={result?.total} />
      ) : null}
    </div>
  );
}

/**
 * Numbered pagination with an ellipsis.
 *
 * Prev/next alone gives no sense of how much catalogue is left, and no way to
 * jump. The window keeps the control a fixed width whatever the page count, so
 * it does not reflow as you move through the pages.
 */
function Pagination({
  page,
  totalPages,
  buildPageLink,
}: {
  page: number;
  totalPages: number;
  buildPageLink: (target: number) => string;
}) {
  const pages: Array<number | 'gap'> = [];
  const push = (n: number) => {
    if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n);
  };
  push(1);
  if (page > 3) pages.push('gap');
  for (let n = page - 1; n <= page + 1; n += 1) push(n);
  if (page < totalPages - 2) pages.push('gap');
  push(totalPages);

  const stepClass =
    'inline-flex h-9 items-center rounded px-3 text-sm font-medium text-ink-900 ring-1 ring-inset ring-ink-300 transition-colors duration-150 hover:bg-ink-50 hover:ring-ink-400 dark:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600';

  return (
    <nav
      className="mt-12 flex items-center justify-between gap-3 border-t border-line pt-6"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Link href={buildPageLink(page - 1)} rel="prev" className={stepClass}>
          <span aria-hidden="true">←</span>
          <span className="ml-1.5 hidden sm:inline">Previous</span>
          <span className="sr-only">Previous page</span>
        </Link>
      ) : (
        <span />
      )}

      <ul className="flex items-center gap-1">
        {pages.map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-ink-400">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={buildPageLink(entry)}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                data-numeric
                className={cx(
                  'inline-flex h-9 min-w-9 items-center justify-center rounded px-2 text-sm transition-colors',
                  entry === page
                    ? 'bg-ink-950 font-semibold text-ink-25'
                    : 'text-ink-700 hover:bg-ink-100 hover:text-ink-950 dark:hover:bg-surface-hover',
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>

      {page < totalPages ? (
        <Link href={buildPageLink(page + 1)} rel="next" className={stepClass}>
          <span className="mr-1.5 hidden sm:inline">Next</span>
          <span aria-hidden="true">→</span>
          <span className="sr-only">Next page</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/**
 * A search that finds nothing is where customers leave. So this offers three
 * ways back in — drop the filters, jump to a category, or take a
 * recommendation — instead of just reporting the empty result.
 */
function NoResults() {
  const { params, activeCount } = useFilters();
  const term = params.get('q');

  return (
    <div>
      <EmptyState
        title={term ? `We couldn’t find anything for “${term}”` : 'No products match those filters'}
        description={
          activeCount > 0
            ? 'Try removing a filter, widening the price range, or checking the spelling.'
            : 'Try a different search term, or browse a category below.'
        }
        action={<ClearFiltersButton />}
      />

      <div className="mt-8 border-t border-line pt-6">
        <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
          Browse categories
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/category/${category.slug}`}
                className="inline-flex h-9 items-center rounded px-3 text-sm font-medium text-ink-900 ring-1 ring-inset ring-ink-300 transition-colors duration-150 hover:bg-ink-25 hover:ring-ink-950 dark:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Recommendations title="You might like these instead" limit={4} />
    </div>
  );
}

const SUGGESTED_CATEGORIES = [
  { name: 'T-Shirts', slug: 't-shirts' },
  { name: 'Shoes', slug: 'shoes' },
  { name: 'Hoodies & Sweatshirts', slug: 'hoodies' },
  { name: 'Jackets', slug: 'jackets' },
  { name: 'Pants', slug: 'pants' },
  { name: 'Bags', slug: 'bags' },
  { name: 'Accessories', slug: 'accessories' },
];

function ClearFiltersButton() {
  const { clearAll, activeCount } = useFilters();
  if (activeCount === 0) return null;
  return (
    <Button variant="secondary" onClick={clearAll}>
      Clear all filters
    </Button>
  );
}

function FilterDrawer({ onClose, total }: { onClose: () => void; total?: number }) {
  const { clearAll, activeCount } = useFilters();
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-scrim-950/50 dark:bg-scrim-950/70"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] animate-slide-up flex-col rounded-t-xl bg-ink-25 shadow-overlay dark:border-t dark:border-line dark:bg-surface-raised">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-base font-semibold text-ink-950">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <FilterPanel />
        </div>
        <div
          className={cx(
            'flex shrink-0 gap-3 border-t border-line px-4 py-3',
            'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
          )}
        >
          {activeCount > 0 ? (
            <Button variant="secondary" onClick={clearAll} className="flex-1">
              Clear all
            </Button>
          ) : null}
          <Button onClick={onClose} className="flex-1">
            {typeof total === 'number' ? `Show ${total} products` : 'Show results'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** `useSearchParams` needs a Suspense boundary to be statically exportable. */
export function ProductListing(props: {
  title: string;
  fixedFilters?: Record<string, string>;
  basePath: string;
  titleFromQueryParam?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-6 lg:py-10">
          <div className="border-b border-line pb-5">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">
              {props.title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">Loading…</p>
          </div>
          <div className="pt-8">
            <ProductGridSkeleton count={12} />
          </div>
        </div>
      }
    >
      <ProductListingInner {...props} />
    </Suspense>
  );
}
