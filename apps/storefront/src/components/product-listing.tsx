'use client';

import type { Paginated, ProductListItemDto } from '@outlet/types';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, CloseIcon, EmptyState, cx } from '@outlet/ui';
import { api } from '@/lib/api';
import { ProductGrid, ProductGridSkeleton } from './product-card';
import { ActiveFilters, FilterPanel, SortSelect, useFilters } from './filter-panel';

const ALLOWED_FILTERS = [
  'q', 'category', 'brand', 'size', 'color', 'targetGroup', 'campaign',
  'minPrice', 'maxPrice', 'minDiscount', 'inStock', 'sort', 'page',
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

  const { data: result, isPending, isError } = useQuery({
    queryKey: ['products', queryString],
    queryFn: () => api.get<Paginated<ProductListItemDto>>(`/catalog/products?${queryString}`),
  });

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
      <div className="border-b border-ink-200 pb-5">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">
          {term ? <span className="font-normal text-ink-500">Results for </span> : null}
          {resolvedTitle}
        </h1>
        <p data-numeric className="mt-1.5 text-sm text-ink-500">
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
                  className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-950 px-1 text-[10px] font-semibold text-white"
                >
                  {activeCount}
                </span>
              ) : null}
            </Button>
            <div className="ml-auto">
              <SortSelect />
            </div>
          </div>

          <div className="hidden lg:block">
            <ActiveFilters />
          </div>

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
                <nav
                  className="mt-12 flex items-center justify-between border-t border-ink-200 pt-6"
                  aria-label="Pagination"
                >
                  {page > 1 ? (
                    <Link
                      href={buildPageLink(page - 1)}
                      className="inline-flex h-9 items-center rounded px-3 text-sm font-medium text-ink-900 ring-1 ring-inset ring-ink-300 transition-colors hover:bg-ink-25 hover:ring-ink-400"
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span data-numeric className="text-sm text-ink-500">
                    Page {page} of {result.totalPages}
                  </span>
                  {page < result.totalPages ? (
                    <Link
                      href={buildPageLink(page + 1)}
                      className="inline-flex h-9 items-center rounded px-3 text-sm font-medium text-ink-900 ring-1 ring-inset ring-ink-300 transition-colors hover:bg-ink-25 hover:ring-ink-400"
                    >
                      Next →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No products match those filters"
              description="Try removing a filter or widening the discount range."
              action={<ClearFiltersButton />}
            />
          )}
        </div>
      </div>

      {drawerOpen ? <FilterDrawer onClose={() => setDrawerOpen(false)} total={result?.total} /> : null}
    </div>
  );
}

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
        className="absolute inset-0 animate-fade-in bg-ink-950/40"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl bg-white shadow-overlay">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 px-4">
          <h2 className="text-base font-semibold text-ink-950">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <FilterPanel />
        </div>
        <div
          className={cx(
            'flex shrink-0 gap-3 border-t border-ink-200 px-4 py-3',
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
          <div className="border-b border-ink-200 pb-5">
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
