'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatDate, Alert, Badge, Button } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { OrderTimeline } from '@/components/order-timeline';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

/**
 * Client half of /account/orders/[id]. Split out of page.tsx so the route file
 * can remain a server component and export generateStaticParams, which a
 * 'use client' module cannot do and the static export requires.
 */
export function AccountOrderDetail() {
  const { money } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const orderId = searchParams.get('id') ?? '';
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['account-order', orderId],
    queryFn: () => api.get<OrderDto>(`/account/orders/${orderId}`),
    // Fulfilment advances on a timer, so the page keeps itself current rather
    // than leaving a stale status until the customer reloads.
    refetchInterval: 10_000,
  });

  const cancel = async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      const updated = await api.post<OrderDto>(`/account/orders/${orderId}/cancel`, {});
      queryClient.setQueryData(['account-order', orderId], updated);
      queryClient.invalidateQueries({ queryKey: ['account-orders'] });
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Could not cancel this order.');
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) return <p className="text-ink-500"><T id="ui.loadingOrder" /></p>;
  if (!order) return <p className="text-ink-500"><T id="ui.orderNotFound" /></p>;

  const canReturn =
    ['SHIPPED', 'DELIVERED', 'PARTIALLY_RETURNED'].includes(order.status) &&
    order.items.some((i) => i.returnableQuantity > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-ink-500">Placed {formatDate(order.placedAt)}</p>
        </div>
        <Badge
          tone={
            order.status === 'CANCELLED' ? 'red' : order.status === 'DELIVERED' ? 'green' : 'blue'
          }
        >
          {order.status}
        </Badge>
      </div>

      {order.status === 'CANCELLED' && order.cancelReason ? (
        <Alert tone="warning">This order was cancelled — {order.cancelReason}</Alert>
      ) : null}
      {cancelError ? <Alert tone="error">{cancelError}</Alert> : null}

      <OrderTimeline order={order} />

      <section className="rounded border border-line bg-ink-25 p-4 dark:bg-surface-card sm:p-5">
        <h2 className="mb-3 font-semibold"><T id="ui.items" /></h2>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 border-t border-ink-100 pt-3 first:border-t-0 first:pt-0"
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-16 w-16 rounded object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded bg-ink-100 dark:bg-surface-active" />
              )}
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-ink-500">
                  {item.sku} · Qty {item.quantity}
                  {item.returnedQuantity > 0 ? ` · ${item.returnedQuantity} returned` : ''}
                </p>
              </div>
              <p className="font-medium">{money(item.totalMinor)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded border border-line bg-ink-25 p-4 text-sm dark:bg-surface-card sm:p-5">
          <h2 className="mb-2 font-semibold"><T id="ui.delivery" /></h2>
          <p className="text-ink-600">
            {order.shippingAddress.firstName} {order.shippingAddress.lastName}
            <br />
            {order.shippingAddress.line1}
            <br />
            {order.shippingAddress.postalCode} {order.shippingAddress.city},{' '}
            {order.shippingAddress.countryCode}
          </p>
          {order.isCancellable ? (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <Button variant="secondary" size="sm" onClick={cancel} loading={cancelling}><T id="ui.cancelThisOrder" /></Button>
              <p className="mt-2 text-xs text-ink-500">
                Cancelling releases the stock back to other customers. Once the parcel ships you
                will need to request a return instead.
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded border border-line bg-ink-25 p-4 text-sm dark:bg-surface-card sm:p-5">
          <h2 className="mb-2 font-semibold"><T id="ui.payment" /></h2>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt className="text-ink-500">Subtotal</dt>
              <dd>{money(order.subtotalMinor)}</dd>
            </div>
            {order.discountMinor > 0 ? (
              <div className="flex justify-between text-success-700">
                <dt>Discount {order.couponCode ? `(${order.couponCode})` : ''}</dt>
                <dd>-{money(order.discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-ink-500"><T id="ui.shipping" /></dt>
              <dd>{money(order.shippingMinor)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1 font-bold">
              <dt><T id="ui.total" /></dt>
              <dd>{money(order.totalMinor)}</dd>
            </div>
          </dl>
          <div className="mt-3 border-t border-ink-100 pt-3">
            {order.payments.map((p) => (
              <p key={p.id} className="text-ink-600">
                {p.provider} ·{' '}
                <Badge
                  tone={p.status === 'PAID' ? 'green' : p.status === 'FAILED' ? 'red' : 'gray'}
                >
                  {p.status}
                </Badge>
                {p.refundedAmountMinor > 0
                  ? ` · refunded ${money(p.refundedAmountMinor)}`
                  : ''}
              </p>
            ))}
          </div>
        </section>
      </div>

      {canReturn ? (
        <Link
          href={`/account/returns/new?orderId=${order.id}`}
          className="inline-block rounded border border-ink-950 px-5 py-2.5 text-sm font-semibold hover:bg-ink-950 hover:text-ink-25"
        ><T id="ui.requestReturn" /></Link>
      ) : null}
    </div>
  );
}
