import { DEMO_PRODUCTS } from '@/lib/demo/data';
import ProductDetailView from './view';

/**
 * `output: 'export'` needs every dynamic route enumerated at build time, and
 * the detail screens are client components — which cannot export this — so the
 * route is split: a server shell that lists the ids, and the interactive view
 * beside it.
 *
 * The demo dataset is deterministic, so its ids are known here. The
 * API-backed build returns nothing and lets Next render each id on demand.
 */
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return [];
  return DEMO_PRODUCTS.map((product) => ({ id: product.id }));
}

export default function Page() {
  return <ProductDetailView />;
}
