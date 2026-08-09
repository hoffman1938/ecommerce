import { Suspense } from 'react';
import { AccountOrderDetail } from '@/components/account-order-detail';

/**
 * Order detail, addressed as `/account/orders/view?id=…` rather than as a
 * dynamic `[id]` segment.
 *
 * Order ids are created at runtime, so there is no build-time list to
 * pre-render. With `output: 'export'` a dynamic segment can only serve ids that
 * generateStaticParams returned, which means every real order 404s — a query
 * parameter has no such constraint and behaves identically in dev, in the
 * static export, and against the real API.
 */
export const metadata = { title: 'Order' };

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<p className="text-ink-500">Loading order…</p>}>
      <AccountOrderDetail />
    </Suspense>
  );
}
