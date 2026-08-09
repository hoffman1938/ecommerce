import { DEMO_CUSTOMERS } from '@/lib/demo/data';
import CustomerDetailView from './view';

/** See products/[id]/page.tsx for why this split exists. */
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return [];
  return DEMO_CUSTOMERS.map((customer) => ({ id: customer.id }));
}

export default function Page() {
  return <CustomerDetailView />;
}
