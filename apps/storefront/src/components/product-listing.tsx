import type { Paginated, ProductListItemDto } from '@outlet/types';
import Link from 'next/link';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from './product-card';
import { FilterBar } from './filter-bar';

export interface ListingParams {
  [key: string]: string | string[] | undefined;
}

function toQueryString(params: ListingParams, fixed: Record<string, string>): string {
  const query = new URLSearchParams();
  const allowed = [
    'q', 'category', 'brand', 'size', 'color', 'targetGroup', 'campaign',
    'minPrice', 'maxPrice', 'minDiscount', 'inStock', 'sort', 'page',
  ];
  for (const key of allowed) {
    const value = params[key];
    if (typeof value === 'string' && value) query.set(key, value);
  }
  for (const [key, value] of Object.entries(fixed)) query.set(key, value);
  query.set('pageSize', '24');
  return query.toString();
}

/**
 * Shared server-rendered product listing used by the catalog, category,
 * brand, and search pages. Filters/sorting are URL-driven (shareable links).
 */
export async function ProductListing({
  title,
  searchParams,
  fixedFilters = {},
  basePath,
}: {
  title: string;
  searchParams: ListingParams;
  fixedFilters?: Record<string, string>;
  basePath: string;
}) {
  const queryString = toQueryString(searchParams, fixedFilters);
  const result = await serverGet<Paginated<ProductListItemDto>>(`/catalog/products?${queryString}`);

  if (!result) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Could not load products — is the API running?
      </p>
    );
  }

  const page = result.page;
  const buildPageLink = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string' && value) next.set(key, value);
    }
    next.set('page', String(target));
    return `${basePath}?${next.toString()}`;
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{title}</h1>
      <p className="mb-4 text-sm text-gray-500">{result.total} products</p>
      <FilterBar />
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
