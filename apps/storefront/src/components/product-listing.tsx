'use client';

import type { Paginated, ProductListItemDto } from '@outlet/types';
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProductGrid } from './product-card';
import { FilterBar } from './filter-bar';

const ALLOWED_FILTERS = [
  'q', 'category', 'brand', 'size', 'color', 'targetGroup', 'campaign',
  'minPrice', 'maxPrice', 'minDiscount', 'inStock', 'sort', 'page',
];

function toQueryString(params: URLSearchParams, fixed: Record<string, string>): string {
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
 * Shared product listing used by the catalog, category, brand, and search
 * pages. Filters and sorting are URL-driven (shareable links).
 *
 * This reads the query string on the client rather than from server-side
 * `searchParams` so the app can be exported as a static site for Cloudflare
 * Pages, where there is no request-time render. The data call itself is
 * unchanged — `api` resolves it against the real API, or against the bundled
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
  /** When set, the heading is derived from this query param (e.g. search). */
  titleFromQueryParam?: string;
}) {
  const searchParams = useSearchParams();
  const queryString = toQueryString(searchParams, fixedFilters);

  const term = titleFromQueryParam ? searchParams.get(titleFromQueryParam) : null;
  const resolvedTitle = term ? `Search results for “${term}”` : title;

  const { data: result, isPending, isError } = useQuery({
    queryKey: ['products', queryString],
    queryFn: () => api.get<Paginated<ProductListItemDto>>(`/catalog/products?${queryString}`),
  });

  const heading = (
    <>
      <h1 className="mb-1 text-2xl font-bold">{resolvedTitle}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {isPending ? 'Loading…' : `${result?.total ?? 0} products`}
      </p>
      <FilterBar />
    </>
  );

  if (isError) {
    return (
      <div>
        {heading}
        <p className="py-10 text-center text-sm text-gray-500">
          Could not load products — is the API running?
        </p>
      </div>
    );
  }

  if (isPending || !result) {
    return (
      <div>
        {heading}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const page = result.page;
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
    <div>
      {heading}
      <ProductGrid products={result.items} />
      {result.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={buildPageLink(page - 1)} className="rounded border px-3 py-1.5 hover:bg-gray-100">
              ← Previous
            </Link>
          ) : null}
          <span className="text-gray-500">
            Page {page} of {result.totalPages}
          </span>
          {page < result.totalPages ? (
            <Link href={buildPageLink(page + 1)} className="rounded border px-3 py-1.5 hover:bg-gray-100">
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
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
        <div>
          <h1 className="mb-1 text-2xl font-bold">{props.title}</h1>
          <p className="mb-4 text-sm text-gray-500">Loading…</p>
        </div>
      }
    >
      <ProductListingInner {...props} />
    </Suspense>
  );
}
