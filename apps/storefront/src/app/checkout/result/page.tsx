'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatMoney } from '@outlet/ui';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/hooks';

interface OrderStatusView {
  status: string;
  orderNumber: string;
  totalMinor?: number;
  currencyCode?: string;
}

function ResultInner() {
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
            });
          }
        } else {
          const payments = await api.get<{ order: { orderNumber: string; status: string } }>(
            `/payments/${params.get('paymentId') ?? ''}/status`,
          ).catch(() => null);
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

  if (!orderId) return <p className="py-10 text-center text-gray-500">Missing order reference.</p>;

  const paid = order && ['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const failed = order && order.status === 'CANCELLED';
  const waiting = !order || order.status === 'AWAITING_PAYMENT';

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      {paid ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
          <h1 className="mt-4 text-2xl font-bold" data-testid="order-confirmed">
            Thank you! Order {order.orderNumber} is confirmed.
          </h1>
          {order.totalMinor != null ? (
            <p className="mt-2 text-gray-600">
              We received your payment of {formatMoney(order.totalMinor, order.currencyCode ?? 'EUR')}. A
              confirmation email is on its way (check Mailpit at{' '}
              <a className="underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
                localhost:8025
              </a>{' '}
              in local development).
            </p>
          ) : null}
          <Link
            href={me?.user ? `/account/orders/${orderId}` : '/'}
            className="mt-6 inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {me?.user ? 'View your order' : 'Continue shopping'}
          </Link>
        </>
      ) : failed ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">✕</div>
          <h1 className="mt-4 text-2xl font-bold">This order was cancelled</h1>
          <p className="mt-2 text-gray-600">
            The payment did not complete (or stock ran out during a delayed payment and it was
            automatically refunded).
          </p>
          <Link href="/cart" className="mt-6 inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
            Back to cart
          </Link>
        </>
      ) : waiting ? (
        <>
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          <h1 className="mt-4 text-2xl font-bold">Waiting for payment confirmation…</h1>
          <p className="mt-2 text-gray-600">
            {attempts > 5
              ? 'Still waiting — a delayed test payment confirms after ~10 seconds. This page refreshes automatically.'
              : 'The payment provider is confirming your payment. This page refreshes automatically.'}
          </p>
        </>
      ) : (
        <p className="text-gray-500">Order status: {order?.status}</p>
      )}
    </div>
  );
}

export default function CheckoutResultPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-gray-500">Loading…</p>}>
      <ResultInner />
    </Suspense>
  );
}
