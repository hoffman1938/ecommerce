import type { Metadata } from 'next';
import Link from 'next/link';
import { QaConsole } from '@/components/qa-console';

export const metadata: Metadata = {
  title: 'Simulation control center',
  description: 'QA controls for the simulated storefront.',
  // A tester tool has no business in search results, even if robots.txt
  // already blocks this deployment.
  robots: { index: false, follow: false },
};

/**
 * The sandbox belongs to the bundled build, and only to it.
 *
 * Everything the console does — travelling forward in time, forcing an order
 * through fulfilment, setting stock — is browser-local state standing in for a
 * backend that is not there. Against the Worker there *is* a backend: those
 * same operations are real writes to D1, and the admin panel already performs
 * them. The console's four `/simulation/*` endpoints exist nowhere on the
 * Worker, so rendering it there produced a screen of failed requests.
 *
 * Saying so, and pointing at the thing that does the job, is the honest
 * version. Hiding the route would leave anyone following the sandbox banner or
 * an old link at a 404 with no explanation.
 */
const SANDBOX_AVAILABLE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function QaPage() {
  if (SANDBOX_AVAILABLE) return <QaConsole />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">
        The simulation sandbox is not part of this build
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-600">
        This storefront is running against the live API, so orders, stock and returns are real rows
        in a real database rather than browser-local state. The sandbox exists for the bundled
        catalogue build, where there is no backend to change.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">
        Everything it offered is available for real in the administration panel: advancing an order
        through fulfilment, adjusting stock, and walking a return through to its refund.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/admin/"
          className="inline-flex h-11 items-center rounded bg-ink-950 px-6 text-sm font-semibold text-ink-25 transition-colors hover:bg-ink-800"
        >
          Open the admin panel
        </Link>
        <Link
          href="/account/orders"
          className="inline-flex h-11 items-center rounded border border-line px-6 text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-50"
        >
          Your orders
        </Link>
      </div>
    </div>
  );
}
