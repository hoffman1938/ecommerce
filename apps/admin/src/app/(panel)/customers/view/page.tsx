import { Suspense } from 'react';
import CustomerDetailPage from './view';

/**
 * Customer detail, addressed as `/customers/view?id=…` rather than as a
 * dynamic `[id]` segment.
 *
 * These ids are database rows created at runtime, so there is no build-time
 * list to pre-render. With `output: 'export'` a dynamic segment can only serve
 * the ids generateStaticParams returned, which means every real customer
 * 404s — a query parameter has no such constraint and behaves identically in
 * dev, in the static export, and against the live API. The storefront's
 * account/orders/view does the same thing for the same reason.
 *
 * The Suspense boundary is required: useSearchParams suspends during
 * pre-rendering, and without it the export fails.
 */
export const metadata = { title: 'Customer' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-500">Loading…</div>}>
      <CustomerDetailPage />
    </Suspense>
  );
}
