'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@outlet/ui';
import { useCart } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { Countdown } from '@/components/countdown';

export default function CartPage() {
  const { data: cart, isLoading, refetch } = useCart();
  const queryClient = useQueryClient();
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutate = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      const result = await fn();
      queryClient.setQueryData(['cart'], result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      refetch();
    }
  };

  if (isLoading) return <p className="py-10 text-center text-gray-500">Loading your cart…</p>;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-gray-500">Reserved items appear here with a 20-minute countdown.</p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse the outlet
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      {cart.messages.map((message) => (
        <p key={message} className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {message}
        </p>
      ))}
      {error ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {cart.items.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4"
              data-testid="cart-item"
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.productName} className="h-24 w-24 rounded object-cover" />
              ) : (
                <div className="h-24 w-24 rounded bg-gray-100" />
              )}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">{item.brandName}</p>
                    <Link href={`/products/${item.productSlug}`} className="font-medium hover:underline">
                      {item.productName}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {item.size ? `Size ${item.size}` : null}
                      {item.size && item.color ? ' · ' : null}
                      {item.color}
                    </p>
                    {item.campaignTitle ? (
                      <p className="text-xs font-medium text-red-600">Campaign: {item.campaignTitle}</p>
                    ) : null}
                  </div>
                  <p className="font-semibold">{formatMoney(item.lineTotalMinor, cart.currencyCode)}</p>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <select
                      value={item.quantity}
                      onChange={(e) =>
                        mutate(() => api.patch(`/cart/items/${item.id}`, { quantity: Number(e.target.value) }))
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      aria-label="Quantity"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => mutate(() => api.delete(`/cart/items/${item.id}`))}
                      className="text-sm text-gray-500 underline"
                    >
                      Remove
                    </button>
                  </div>
                  {item.reservation ? (
                    <p className="text-sm text-gray-600">
                      Reserved for <Countdown expiresAt={item.reservation.expiresAt} onExpired={() => refetch()} />
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-red-600">Reservation expired</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="h-fit rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Summary</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Subtotal</dt>
              <dd>{formatMoney(cart.subtotalMinor, cart.currencyCode)}</dd>
            </div>
            {cart.discountMinor > 0 ? (
              <div className="flex justify-between text-green-700">
                <dt>Coupon ({cart.couponCode})</dt>
                <dd>-{formatMoney(cart.discountMinor, cart.currencyCode)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-gray-500">Estimated shipping</dt>
              <dd>{cart.shippingMinor === 0 ? 'Free' : formatMoney(cart.shippingMinor, cart.currencyCode)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd data-testid="cart-total">{formatMoney(cart.totalMinor, cart.currencyCode)}</dd>
            </div>
            <p className="text-xs text-gray-400">
              Includes {formatMoney(cart.taxMinor, cart.currencyCode)} VAT
            </p>
          </dl>

          {cart.couponCode ? (
            <button
              type="button"
              onClick={() => mutate(() => api.delete('/cart/coupon'))}
              className="mt-3 text-sm text-gray-500 underline"
            >
              Remove coupon {cart.couponCode}
            </button>
          ) : (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (couponCode) mutate(() => api.post('/cart/coupon', { code: couponCode }));
              }}
            >
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Coupon code"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button className="rounded bg-gray-100 px-3 py-2 text-sm font-medium hover:bg-gray-200">
                Apply
              </button>
            </form>
          )}

          <Link
            href="/checkout"
            data-testid="go-to-checkout"
            className="mt-5 block rounded-md bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
          >
            Checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
