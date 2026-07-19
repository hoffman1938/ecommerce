import { ProductListing, type ListingParams } from '@/components/product-listing';

export const dynamic = 'force-dynamic';

export default function SearchPage({ searchParams }: { searchParams: ListingParams }) {
  const q = typeof searchParams.q === 'string' ? searchParams.q : '';
  return (
    <ProductListing
      title={q ? `Search results for “${q}”` : 'Search'}
      searchParams={searchParams}
      basePath="/search"
    />
  );
}
