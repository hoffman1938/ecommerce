import { ProductListing, type ListingParams } from '@/components/product-listing';

export const dynamic = 'force-dynamic';

export default function BrandPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: ListingParams;
}) {
  const title = params.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <ProductListing
      title={title}
      searchParams={searchParams}
      fixedFilters={{ brand: params.slug }}
      basePath={`/brand/${params.slug}`}
    />
  );
}
