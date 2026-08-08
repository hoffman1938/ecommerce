import { ProductListing } from '@/components/product-listing';

export const metadata = { title: 'Outlet catalog' };

export default function ProductsPage() {
  return <ProductListing title="Outlet catalog" basePath="/products" />;
}
