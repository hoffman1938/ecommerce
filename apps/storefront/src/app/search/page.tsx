import { ProductListing } from '@/components/product-listing';

export const metadata = { title: 'Search' };

export default function SearchPage() {
  return <ProductListing titleKey="ui.search" basePath="/search" titleFromQueryParam="q" />;
}
