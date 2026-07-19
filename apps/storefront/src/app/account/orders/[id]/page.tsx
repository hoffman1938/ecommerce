'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { formatMoney, formatDate, Badge } from '@outlet/ui';
import { api } from '@/lib/api';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: order, isLoading } = useQuery({
    queryKey: ['account-order', params.id],
    queryFn: () => api.get<OrderDto>(`/account/orders/${params.id}`),
  });

  if (isLoading) return <p className="text-gray-500">Loading order…</p>;
  if (!order) return <p className="text-gray-500">Order not found.</p>;

  const canReturn =
    ['SHIPPED', 'DELIVERED', 'PARTIALLY_RETURNED'].includes(order.status) &&
    order.items.some((i) => i.returnableQuantity > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-gray-500">Placed {formatDate(order.placedAt)}</p>
        </div>
        <Badge tone={order.status === 'CANCELLED' ? 'red' : order.status === 'DELIVERED' ? 'green' : 'blue'}>
          {order.status}
        </Badge>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Items</h2>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded object-cover" />
              ) : (
                <div className="h-16 w-16 rounded bg-gray-100" />
              )}
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-gray-500">
                  {item.sku} · Qty {item.quantity}
                  {item.returnedQuantity > 0 ? ` · ${item.returnedQuantity} returned` : ''}
                </p>
              </div>
              <p className="font-medium">{formatMoney(item.totalMinor, order.currencyCode)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
          <h2 className="mb-2 font-semibold">Delivery</h2>
          <p className="text-gray-600">
            {order.shippingAddress.firstName} {order.shippingAddress.lastName}
            <br />
            {order.shippingAddress.line1}
            <br />
            {order.shippingAddress.postalCode} {order.shippingAddress.city},{' '}
            {order.shippingAddress.countryCode}
          </p>
          {order.shipments.length > 0 ? (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <h3 className="mb-1 font-medium">Shipment tracking</h3>
              {order.shipments.map((s) => (
                <p key={s.id} className="text-gray-600">
                  {s.carrier ?? 'Carrier'} · {s.trackingNumber ?? 'tracking pending'} ·{' '}
                  <Badge tone={s.status === 'DELIVERED' ? 'green' : 'blue'}>{s.status}</Badge>
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
          <h2 className="mb-2 font-semibold">Payment</h2>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Subtotal</dt>
              <dd>{formatMoney(order.subtotalMinor, order.currencyCode)}</dd>
            </div>
            {order.discountMinor > 0 ? (
              <div className="flex justify-between text-green-700">
                <dt>Discount {order.couponCode ? `(${order.couponCode})` : ''}</dt>
                <dd>-{formatMoney(order.discountMinor, order.currencyCode)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-gray-500">Shipping</dt>
              <dd>{formatMoney(order.shippingMinor, order.currencyCode)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
              <dt>Total</dt>
              <dd>{formatMoney(order.totalMinor, order.currencyCode)}</dd>
            </div>
          </dl>
          <div className="mt-3 border-t border-gray-100 pt-3">
            {order.payments.map((p) => (
              <p key={p.id} className="text-gray-600">
                {p.provider} · <Badge tone={p.status === 'PAID' ? 'green' : p.status === 'FAILED' ? 'red' : 'gray'}>{p.status}</Badge>
                {p.refundedAmountMinor > 0
                  ? ` · refunded ${formatMoney(p.refundedAmountMinor, order.currencyCode)}`
                  : ''}
              </p>
            ))}
          </div>
        </section>
      </div>

      {canReturn ? (
        <Link
          href={`/account/returns/new?orderId=${order.id}`}
          className="inline-block rounded-md border border-gray-900 px-5 py-2.5 text-sm font-semibold hover:bg-gray-900 hover:text-white"
        >
          Request a return
        </Link>
      ) : null}
    </div>
  );
}
