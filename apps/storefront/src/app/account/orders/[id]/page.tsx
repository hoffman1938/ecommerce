import { AccountOrderDetail } from '@/components/account-order-detail';

/**
 * Order ids live only in the database, so there is nothing real to pre-render.
 * An empty array is not an option: with `output: 'export'` Next produces zero
 * paths for the segment and then reports generateStaticParams as missing, which
 * fails the build. One placeholder path satisfies the exporter; the page it
 * produces renders the client component's "Order not found" state, which is the
 * truthful result for a demo with no orders behind it.
 *
 * With a real API behind the app this route is server-rendered as before and
 * the client component fetches the order at runtime.
 */
export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: 'demo' }];
}

export const metadata = { title: 'Order' };

export default function OrderDetailPage() {
  return <AccountOrderDetail />;
}
