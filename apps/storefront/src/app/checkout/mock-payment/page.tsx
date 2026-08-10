'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, TextField, cx, formatMoney } from '@outlet/ui';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import {
  OUTCOME_MESSAGES,
  TEST_CARDS,
  formatCardNumber,
  validateCard,
  type CardFormValues,
} from '@/lib/test-cards';

/**
 * Simulated payment page.
 *
 * Presents a card form so the checkout looks and behaves like the real thing,
 * but the number is resolved to an outcome *in the browser* and only that
 * outcome code is sent. No card data is transmitted or stored anywhere — see
 * lib/test-cards.ts.
 *
 * The direct outcome buttons below the form stay because they are the fastest
 * way to drive a specific branch, and the e2e suite drives them by test id.
 */

const DIRECT_OUTCOMES = [
  { code: 'TEST-SUCCESS', label: 'Pay successfully' },
  { code: 'TEST-FAIL', label: 'Simulate failed payment' },
  { code: 'TEST-CANCEL', label: 'Cancel payment' },
  { code: 'TEST-DELAYED', label: 'Simulate delayed confirmation (~10s)' },
] as const;

const EMPTY_FORM: CardFormValues = { number: '', name: '', expiry: '', cvc: '' };

function MockPaymentInner() {
  const params = useSearchParams();
  const router = useRouter();
  const paymentId = params.get('paymentId') ?? '';
  const amount = Number(params.get('amount') ?? '0');
  const currency = params.get('currency') ?? 'EUR';
  const orderNumber = params.get('orderNumber') ?? '';
  const returnUrl = params.get('returnUrl') ?? '/';

  const [form, setForm] = useState<CardFormValues>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCards, setShowCards] = useState(false);

  const leave = () => {
    const isAbsolute = returnUrl.startsWith('http');
    if (isAbsolute && !returnUrl.startsWith(window.location.origin)) {
      window.location.href = returnUrl;
      return;
    }
    router.push(isAbsolute ? returnUrl.replace(window.location.origin, '') : returnUrl);
  };

  const simulate = async (outcome: string) => {
    setBusy(outcome);
    setError(null);
    try {
      // The API turns this into a signed webhook and processes it through
      // the same verification path a real provider would use.
      await api.post(`/payments/mock/${paymentId}/simulate`, { outcome });

      // Failures keep the tester on this page so they can retry, exactly as a
      // real gateway would. Only a resolved payment navigates away.
      const failure = OUTCOME_MESSAGES[outcome];
      if (failure) {
        track('payment_failed', { reason: outcome });
        setError(failure);
        setBusy(null);
        return;
      }
      leave();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const paySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    const result = validateCard(form);
    if (!result.ok) {
      setFieldError({ field: result.field, message: result.message });
      return;
    }
    simulate(result.outcome);
  };

  const fill = (number: string) => {
    setForm({
      number: formatCardNumber(number),
      name: 'QA Tester',
      expiry: '12/34',
      cvc: '123',
    });
    setFieldError(null);
    setError(null);
  };

  if (!paymentId) {
    return <p className="py-10 text-center text-ink-500">Missing payment reference.</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <div className="rounded-xl border border-line bg-ink-25 dark:bg-surface-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <span className="rounded-xs bg-warning-100 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-[0.06em] text-warning-700">
            Sandbox
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-400">
            Simulated payment provider
          </p>
        </div>

        <h1 className="mt-3 text-xl font-bold text-ink-950">Order {orderNumber}</h1>
        <p data-numeric className="mt-1 text-3xl font-black text-ink-950">
          {formatMoney(amount, currency)}
        </p>
        <p className="mt-2 text-sm text-ink-500">
          No real payment is taken and no card details are stored or transmitted. Use a test card
          below — never a real one.
        </p>

        {error ? (
          <div className="mt-5" data-testid="payment-error">
            <Alert tone="error" title="Payment declined">
              {error}
            </Alert>
          </div>
        ) : null}

        <form onSubmit={paySubmit} className="mt-6 space-y-4">
          <TextField
            id="card-number"
            label="Card number"
            inputMode="numeric"
            autoComplete="off"
            placeholder="4242 4242 4242 4242"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: formatCardNumber(e.target.value) })}
            error={fieldError?.field === 'number' ? fieldError.message : undefined}
            data-testid="card-number"
          />
          <TextField
            id="card-name"
            label="Name on card"
            autoComplete="off"
            placeholder="QA Tester"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={fieldError?.field === 'name' ? fieldError.message : undefined}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              id="card-expiry"
              label="Expiry"
              inputMode="numeric"
              autoComplete="off"
              placeholder="MM/YY"
              value={form.expiry}
              onChange={(e) => setForm({ ...form, expiry: e.target.value })}
              error={fieldError?.field === 'expiry' ? fieldError.message : undefined}
            />
            <TextField
              id="card-cvc"
              label="Security code"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123"
              value={form.cvc}
              onChange={(e) => setForm({ ...form, cvc: e.target.value })}
              error={fieldError?.field === 'cvc' ? fieldError.message : undefined}
            />
          </div>

          <Button type="submit" size="lg" fullWidth loading={busy !== null} data-testid="pay-now">
            Pay {formatMoney(amount, currency)}
          </Button>
        </form>

        <div className="mt-6 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => setShowCards((v) => !v)}
            aria-expanded={showCards}
            className="text-sm font-medium text-ink-700 underline underline-offset-2 transition-colors hover:text-ink-950"
          >
            {showCards ? 'Hide test cards' : 'Show test cards'}
          </button>

          {showCards ? (
            <ul className="mt-3 space-y-1.5">
              {TEST_CARDS.map((card) => (
                <li key={card.number}>
                  <button
                    type="button"
                    onClick={() => fill(card.number)}
                    className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-ink-50 dark:hover:bg-surface-hover"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-900">{card.label}</span>
                      <span className="block text-xs text-ink-500">{card.description}</span>
                    </span>
                    <code data-numeric className="shrink-0 text-xs text-ink-600">
                      {formatCardNumber(card.number)}
                    </code>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <details className="mt-5 border-t border-line pt-5">
          <summary className="cursor-pointer text-sm font-medium text-ink-700 hover:text-ink-950">
            Force an outcome directly
          </summary>
          <div className="mt-3 space-y-2">
            {DIRECT_OUTCOMES.map((outcome) => (
              <button
                key={outcome.code}
                type="button"
                disabled={busy !== null}
                onClick={() => simulate(outcome.code)}
                data-testid={`mock-${outcome.code}`}
                className={cx(
                  'w-full rounded px-4 py-2.5 text-sm font-medium text-ink-900',
                  'ring-1 ring-inset ring-ink-300 transition-colors hover:bg-ink-50 dark:hover:bg-surface-hover hover:ring-ink-400',
                  'disabled:opacity-60',
                )}
              >
                {busy === outcome.code ? 'Processing…' : `${outcome.label} (${outcome.code})`}
              </button>
            ))}
          </div>
        </details>
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
