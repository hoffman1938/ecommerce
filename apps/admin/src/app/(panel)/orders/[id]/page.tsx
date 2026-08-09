import { DEMO_ORDERS } from '@/lib/demo/data';
import OrderDetailView from './view';

/** See products/[id]/page.tsx for why this split exists. */
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return [];
  return DEMO_ORDERS.map((order) => ({ id: order.id }));
}

export default function Page() {
  return <OrderDetailView />;
}
