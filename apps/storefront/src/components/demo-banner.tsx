/**
 * Shown only on the Cloudflare Pages demo build.
 *
 * The whole shop works here, but it works *in the browser* — there is no
 * NestJS API, PostgreSQL or Redis behind this deployment. Saying so plainly
 * matters: a visitor who places an order should know it is not a real order,
 * and that their data never leaves their own machine.
 */
export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] leading-relaxed text-amber-900">
      <strong className="font-semibold">Static demo.</strong> Browsing, accounts, cart, checkout,
      orders and returns all work — but entirely in your browser, with no server behind them. Sign
      in with <code className="rounded bg-amber-100 px-1">customer@example.local</code> /{' '}
      <code className="rounded bg-amber-100 px-1">Customer123!</code>, or register any address.
      Payments are simulated and no order is real.
    </div>
  );
}
