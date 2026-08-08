/**
 * Shown only on the Cloudflare Pages demo build. Cloudflare Pages serves static
 * assets, so the NestJS API, PostgreSQL, Redis and the BullMQ worker are not
 * running behind this deployment — browsing and the cart work from a bundled
 * copy of the seed catalog, while accounts and checkout do not. Saying so up
 * front is better than letting a visitor discover it at the payment step.
 */
export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      <strong className="font-semibold">Static demo.</strong> Browsing, filtering, and the
      20-minute cart reservation run on a bundled copy of the seed catalog. Sign-in, checkout, and
      orders need the NestJS API, PostgreSQL, and Redis, which Cloudflare Pages cannot host.
    </div>
  );
}
