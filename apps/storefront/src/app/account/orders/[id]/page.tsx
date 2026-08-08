import { AccountOrderDetail } from '@/components/account-order-detail';

/**
 * Order ids are per-customer and only exist in the database, so there is
 * nothing to pre-render. Returning an empty set keeps the static export valid;
 * with a real API behind it, the client component fetches the order at runtime.
 */
export function generateStaticParams(): Array<{ id: string }> {
  return [];
}

export const metadata = { title: 'Order' };

export default function OrderDetailPage() {
  return <AccountOrderDetail />;
}
