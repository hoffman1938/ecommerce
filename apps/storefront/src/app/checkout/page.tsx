'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addressSchema } from '@outlet/validation';
import type { CheckoutQuoteDto, PaymentSessionDto } from '@outlet/types';
import { formatMoney } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useCurrentUser } from '@/lib/hooks';
import { Countdown } from '@/components/countdown';

const checkoutFormSchema = z.object({
  email: z.string().email('Enter a valid email'),
  shippingAddress: addressSchema,
  billingSameAsShipping: z.boolean(),
  billingAddress: addressSchema.optional(),
  shippingMethod: z.enum(['STANDARD', 'EXPRESS']),
  customerNote: z.string().max(1000).optional(),
});
type CheckoutForm = z.infer<typeof checkoutFormSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      billingSameAsShipping: true,
      shippingMethod: 'STANDARD',
      shippingAddress: { countryCode: 'DE' } as CheckoutForm['shippingAddress'],
    },
  });

  useEffect(() => {
    api
      .post<CheckoutQuoteDto>('/checkout/start')
      .then(setQuote)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 400) router.replace('/cart');
        else setError(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (me?.user) {
      form.setValue('email', me.user.email);
      form.setValue('shippingAddress.firstName', me.user.firstName);
      form.setValue('shippingAddress.lastName', me.user.lastName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user?.id]);

  const shippingMethod = form.watch('shippingMethod');
  const billingSame = form.watch('billingSameAsShipping');

  const totals = useMemo(() => {
    if (!quote) return null;
    const cart = quote.cart;
    const method = quote.shippingMethods.find((m) => m.id === shippingMethod);
    const discounted = cart.subtotalMinor - cart.discountMinor;
    const shipping =
      shippingMethod === 'STANDARD' && cart.shippingMinor === 0 ? 0 : (method?.priceMinor ?? 0);
    return {
      subtotal: cart.subtotalMinor,
      discount: cart.discountMinor,
      shipping,
      total: discounted + shipping,
    };
  }, [quote, shippingMethod]);

  const onSubmit = async (values: CheckoutForm) => {
    if (!quote || !totals) return;
    setSubmitting(true);
    setError(null);
    track('checkout_started', {
      itemCount: quote.cart.itemCount,
      totalMinor: totals.total,
    });
    try {
      const session = await api.post<PaymentSessionDto>('/checkout/submit', {
        email: values.email,
        shippingAddress: values.shippingAddress,
        billingAddress: values.billingSameAsShipping
          ? values.shippingAddress
          : values.billingAddress,
        billingSameAsShipping: values.billingSameAsShipping,
        shippingMethod: values.shippingMethod,
        customerNote: values.customerNote || null,
        expectedTotalMinor: totals.total,
        idempotencyKey,
      });
      window.location.href = session.redirectUrl;
    } catch (err) {
      if (err instanceof ApiError && err.body.code === 'TOTALS_CHANGED') {
        setError(
          'Prices changed while you were checking out. The page will reload with the new totals.',
        );
        const fresh = await api.post<CheckoutQuoteDto>('/checkout/start').catch(() => null);
        if (fresh) setQuote(fresh);
      } else if (err instanceof ApiError && err.body.code === 'RESERVATIONS_EXPIRED') {
        setError('Your reservations expired. Redirecting you to the cart…');
        setTimeout(() => router.push('/cart'), 1500);
      } else {
        setError((err as Error).message);
      }
      track('payment_failed', {
        reason: err instanceof ApiError ? (err.body.code ?? 'UNKNOWN') : 'UNKNOWN',
      });
      setSubmitting(false);
    }
  };

  if (!quote) {
    return (
      <div className="container-page py-16 text-center text-sm text-ink-500">
        {error ?? 'Preparing checkout…'}
      </div>
    );
  }

  const field = (
    name:
      | 'shippingAddress.firstName'
      | 'shippingAddress.lastName'
      | 'shippingAddress.line1'
      | 'shippingAddress.line2'
      | 'shippingAddress.city'
      | 'shippingAddress.postalCode'
      | 'shippingAddress.countryCode'
      | 'shippingAddress.phone',
    label: string,
    span2 = false,
  ) => (
    <label className={`block text-sm ${span2 ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block font-medium text-ink-700">{label}</span>
      <input {...form.register(name)} className="w-full rounded border border-ink-300 px-3 py-2" />
    </label>
  );

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="border-b border-ink-200 pb-5">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">Checkout</h1>
        {quote.reservationDeadline ? (
          <p className="mt-1.5 text-sm text-ink-600">
            Your items stay reserved for{' '}
            <Countdown
              expiresAt={quote.reservationDeadline}
              onExpired={() => router.push('/cart')}
            />
          </p>
        ) : null}
      </div>
      {error ? (
        <div
          className="mt-6 rounded border border-sale-200 bg-sale-50 px-3.5 py-3 text-sm text-sale-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className="h-8" />

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section className="rounded border border-ink-200 bg-ink-25 p-5">
            <h2 className="mb-3 font-semibold">1 · Contact</h2>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink-700">Email</span>
              <input
                type="email"
                {...form.register('email')}
                className="w-full rounded border border-ink-300 px-3 py-2"
              />
              {form.formState.errors.email ? (
                <span className="text-xs text-sale-500">{form.formState.errors.email.message}</span>
              ) : null}
            </label>
          </section>

          <section className="rounded border border-ink-200 bg-ink-25 p-5">
            <h2 className="mb-3 font-semibold">2 · Shipping address</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('shippingAddress.firstName', 'First name')}
              {field('shippingAddress.lastName', 'Last name')}
              {field('shippingAddress.line1', 'Street and number', true)}
              {field('shippingAddress.line2', 'Apartment, suite (optional)', true)}
              {field('shippingAddress.city', 'City')}
              {field('shippingAddress.postalCode', 'Postal code')}
              {field('shippingAddress.countryCode', 'Country code (e.g. DE)')}
              {field('shippingAddress.phone', 'Phone (optional)')}
            </div>
            {Object.keys(form.formState.errors.shippingAddress ?? {}).length > 0 ? (
              <p className="mt-2 text-xs text-sale-500">
                Please complete the highlighted address fields.
              </p>
            ) : null}
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register('billingSameAsShipping')} />
              Billing address is the same as shipping
            </label>
            {!billingSame ? (
              <p className="mt-2 text-xs text-ink-500">
                Billing address entry uses the shipping fields above in this MVP — uncheck is noted
                on the order.
              </p>
            ) : null}
          </section>

          <section className="rounded border border-ink-200 bg-ink-25 p-5">
            <h2 className="mb-3 font-semibold">3 · Delivery</h2>
            <div className="space-y-2">
              {quote.shippingMethods.map((method) => (
                <label
                  key={method.id}
                  className="flex cursor-pointer items-center justify-between rounded border border-ink-200 px-4 py-3 text-sm has-[:checked]:border-ink-950"
                >
                  <span className="flex items-center gap-3">
                    <input type="radio" value={method.id} {...form.register('shippingMethod')} />
                    <span>
                      <span className="font-medium">{method.label}</span>
                      <span className="block text-xs text-ink-500">{method.estimatedDays}</span>
                    </span>
                  </span>
                  <span>
                    {method.id === 'STANDARD' && quote.cart.shippingMinor === 0
                      ? 'Free'
                      : formatMoney(method.priceMinor, quote.cart.currencyCode)}
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-ink-700">Order note (optional)</span>
              <textarea
                {...form.register('customerNote')}
                rows={2}
                className="w-full rounded border border-ink-300 px-3 py-2"
              />
            </label>
          </section>
        </div>

        <aside className="h-fit rounded border border-ink-200 bg-ink-25 p-5">
          <h2 className="font-semibold">4 · Review &amp; pay</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {quote.cart.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2">
                <span className="text-ink-600">
                  {item.productName} × {item.quantity}
                </span>
                <span>{formatMoney(item.lineTotalMinor, quote.cart.currencyCode)}</span>
              </li>
            ))}
          </ul>
          {totals ? (
            <dl className="mt-4 space-y-1.5 border-t border-ink-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd>{formatMoney(totals.subtotal, quote.cart.currencyCode)}</dd>
              </div>
              {totals.discount > 0 ? (
                <div className="flex justify-between text-success-700">
                  <dt>Discount</dt>
                  <dd>-{formatMoney(totals.discount, quote.cart.currencyCode)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-500">Shipping</dt>
                <dd>
                  {totals.shipping === 0
                    ? 'Free'
                    : formatMoney(totals.shipping, quote.cart.currencyCode)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd data-testid="checkout-total">
                  {formatMoney(totals.total, quote.cart.currencyCode)}
                </dd>
              </div>
            </dl>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            data-testid="pay-now"
            className="mt-5 w-full rounded bg-ink-950 px-5 py-3 text-sm font-semibold text-ink-25 hover:bg-ink-800 disabled:bg-ink-200"
          >
            {submitting ? 'Creating payment…' : 'Continue to payment'}
          </button>
          <p className="mt-3 text-xs text-ink-500">
            Local development uses a mock payment provider — no real charges.
          </p>
        </aside>
      </form>
    </div>
  );
}
