'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatMoney } from '@outlet/ui';
import { api } from '@/lib/api';

const OUTCOMES = [
  { code: 'TEST-SUCCESS', label: 'Pay successfully', tone: 'bg-success-600 hover:bg-success-700' },
  { code: 'TEST-FAIL', label: 'Simulate failed payment', tone: 'bg-sale-500 hover:bg-sale-600' },
  { code: 'TEST-CANCEL', label: 'Cancel payment', tone: 'bg-ink-500 hover:bg-ink-600' },
  {
    code: 'TEST-DELAYED',
    label: 'Simulate delayed confirmation (~10s)',
    tone: 'bg-warning-600 hover:bg-warning-700',
  },
] as const;

function MockPaymentInner() {
  const params = useSearchParams();
  const router = useRouter();
  const paymentId = params.get('paymentId') ?? '';
  const amount = Number(params.get('amount') ?? '0');
  const currency = params.get('currency') ?? 'EUR';
  const orderNumber = params.get('orderNumber') ?? '';
  const returnUrl = params.get('returnUrl') ?? '/';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const simulate = async (outcome: string) => {
    setBusy(outcome);
    setError(null);
    try {
      // The API turns this into a signed webhook and processes it through
      // the same verification path a real provider would use.
      await api.post(`/payments/mock/${paymentId}/simulate`, { outcome });
      router.push(
        returnUrl.startsWith('http') ? returnUrl.replace(window.location.origin, '') : returnUrl,
      );
      if (returnUrl.startsWith('http') && !returnUrl.startsWith(window.location.origin)) {
        window.location.href = returnUrl;
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  if (!paymentId) {
    return <p className="py-10 text-center text-ink-500">Missing payment reference.</p>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-ink-200 bg-ink-25 p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-400">
          Mock payment provider · local test mode
        </p>
        <h1 className="mt-2 text-xl font-bold">Order {orderNumber}</h1>
        <p className="mt-1 text-3xl font-black">{formatMoney(amount, currency)}</p>
        <p className="mt-2 text-sm text-ink-500">
          Choose a test outcome. Real deployments swap this page for Stripe via
          <code className="mx-1 rounded bg-ink-100 px-1">PAYMENT_PROVIDER=stripe</code>.
        </p>

        <div className="mt-6 space-y-3">
          {OUTCOMES.map((outcome) => (
            <button
              key={outcome.code}
              type="button"
              disabled={busy !== null}
              onClick={() => simulate(outcome.code)}
              data-testid={`mock-${outcome.code}`}
              className={`w-full rounded px-4 py-3 text-sm font-semibold text-ink-25 disabled:opacity-60 ${outcome.tone}`}
            >
              {busy === outcome.code ? 'Processing…' : `${outcome.label} (${outcome.code})`}
            </button>
          ))}
        </div>
        {error ? <p className="mt-4 text-sm text-sale-500">{error}</p> : null}
      </div>
    </div>
  );
}

export default function MockPaymentPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-ink-500">Loading…</p>}>
      <MockPaymentInner />
    </Suspense>
  );
}
