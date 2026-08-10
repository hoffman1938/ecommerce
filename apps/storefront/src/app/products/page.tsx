import { ProductListing } from '@/components/product-listing';

export const metadata = { title: 'Outlet catalog' };

export default function ProductsPage() {
  return <ProductListing titleKey="ui.outletCatalog" basePath="/products" />;
}
