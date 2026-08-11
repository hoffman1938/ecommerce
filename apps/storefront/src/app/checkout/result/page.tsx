'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { api, DEMO_MODE } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useCurrentUser } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

interface OrderStatusView {
  status: string;
  orderNumber: string;
  totalMinor?: number;
  currencyCode?: string;
  itemCount?: number;
}

function ResultInner() {
  const { money } = useI18n();
  const params = useSearchParams();
  const orderId = params.get('orderId');
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [order, setOrder] = useState<OrderStatusView | null>(null);
  const [attempts, setAttempts] = useState(0);

  // The redirect back from the payment page proves nothing — the API only
  // marks orders paid via verified webhooks. This page just polls the status.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        if (me?.user) {
          const data = await api.get<OrderDto>(`/account/orders/${orderId}`);
          if (!cancelled) {
            setOrder({
              status: data.status,
              orderNumber: data.orderNumber,
              totalMinor: data.totalMinor,
              currencyCode: data.currencyCode,
              itemCount: data.items.reduce((sum, item) => sum + item.quantity, 0),
            });
          }
        } else {
          const payments = await api
            .get<{ order: { orderNumber: string; status: string } }>(
              `/payments/${params.get('paymentId') ?? ''}/status`,
            )
            .catch(() => null);
          if (!cancelled && payments) {
            setOrder({ status: payments.order.status, orderNumber: payments.order.orderNumber });
          }
        }
      } catch {
        // keep polling
      }
      if (!cancelled) setAttempts((a) => a + 1);
    };
    poll();
    const interval = setInterval(poll, 2000);
    const stop = setTimeout(() => clearInterval(interval), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, me?.user?.id]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['cart'] });
  }, [order?.status, queryClient]);

  // Fire `purchase` exactly once, when the polled status first reaches a paid
  // state — the poller re-runs, and a duplicate purchase event would corrupt
  // whatever the sink is feeding.
  const purchaseReported = useRef(false);
  useEffect(() => {
    if (purchaseReported.current || !order) return;
    if (!['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(order.status)) return;
    purchaseReported.current = true;
    track('purchase', {
      orderNumber: order.orderNumber,
      totalMinor: order.totalMinor ?? 0,
      currency: order.currencyCode ?? 'EUR',
      itemCount: order.itemCount ?? 0,
    });
  }, [order]);

  if (!orderId)
    return (
      <p className="py-8 text-center lg:py-10 text-ink-500">
        <T id="ui.missingOrderReference" />
      </p>
    );

  const paid =
    order && ['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const failed = order && order.status === 'CANCELLED';
  const waiting = !order || order.status === 'AWAITING_PAYMENT';

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      {paid ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-3xl">
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-bold" data-testid="order-confirmed">
            Thank you! Order {order.orderNumber} is confirmed.
          </h1>
          {order.totalMinor != null ? (
            <p className="mt-2 text-ink-600">
              We received your payment of {money(order.totalMinor)}. A confirmation email has been
              sent.{' '}
              {DEMO_MODE ? (
                <>
                  {/* No mail leaves the sandbox, so point at the simulated
                      mailbox rather than an SMTP catcher that is not running. */}
                  Read it in your{' '}
                  <Link href="/account/inbox" className="underline underline-offset-2">
                    simulated inbox
                  </Link>
                  .
                </>
              ) : (
                <>
                  In local development it is captured by Mailpit at{' '}
                  <a
                    className="underline"
                    href="http://localhost:8025"
                    target="_blank"
                    rel="noreferrer"
                  >
                    localhost:8025
                  </a>
                  .
                </>
              )}
            </p>
          ) : null}
          <Link
            href={me?.user ? `/account/orders/view?id=${orderId}` : '/'}
            className="mt-6 inline-block rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25"
          >
            {me?.user ? 'View your order' : 'Continue shopping'}
          </Link>
        </>
      ) : failed ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sale-100 text-3xl">
            ✕
          </div>
          <h1 className="mt-4 text-2xl font-bold">
            <T id="ui.thisOrderWasCancelled" />
          </h1>
          <p className="mt-2 text-ink-600">
            The payment did not complete (or stock ran out during a delayed payment and it was
            automatically refunded).
          </p>
          <Link
            href="/cart"
            className="mt-6 inline-block rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25"
          >
            <T id="ui.backCart" />
          </Link>
        </>
      ) : waiting ? (
        <>
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-line border-t-ink-950" />
          <h1 className="mt-4 text-2xl font-bold">
            <T id="ui.waitingPaymentConfirmation" />
          </h1>
          <p className="mt-2 text-ink-600">
            {attempts > 5
              ? 'Still waiting — a delayed test payment confirms after ~10 seconds. This page refreshes automatically.'
              : 'The payment provider is confirming your payment. This page refreshes automatically.'}
          </p>
        </>
      ) : (
        <p className="text-ink-500">Order status: {order?.status}</p>
      )}
    </div>
  );
}

export default function CheckoutResultPage() {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center lg:py-10 text-ink-500">
          <T id="ui.loading" />
        </p>
      }
    >
      <ResultInner />
    </Suspense>
  );
}
