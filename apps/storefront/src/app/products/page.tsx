import { ProductListing, type ListingParams } from '@/components/product-listing';

export const dynamic = 'force-dynamic';

export default function ProductsPage({ searchParams }: { searchParams: ListingParams }) {
  return (
    <ProductListing title="Outlet catalog" searchParams={searchParams} basePath="/products" />
  );
}
