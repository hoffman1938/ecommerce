import { ProductListing, type ListingParams } from '@/components/product-listing';

export const dynamic = 'force-dynamic';

export default function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: ListingParams;
}) {
  const title = params.slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <ProductListing
      title={title}
      searchParams={searchParams}
      fixedFilters={{ category: params.slug }}
      basePath={`/category/${params.slug}`}
    />
  );
}
