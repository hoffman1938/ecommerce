import { ProductListing } from '@/components/product-listing';

export const metadata = { title: 'Search' };

export default function SearchPage() {
  return <ProductListing title="Search" basePath="/search" titleFromQueryParam="q" />;
}
