'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CartItemDto, FreeShippingProgressDto } from '@outlet/types';
import { Alert, Button, EmptyState, Skeleton, cx, formatMoney } from '@outlet/ui';
import { useCart } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { track } from '@/lib/analytics';
import { Countdown } from '@/components/countdown';
import { Recommendations } from '@/components/recommendations';
import { PageHeader } from '@/components/section';

export default function CartPage() {
  const { data: cart, isLoading, refetch } = useCart();
  const queryClient = useQueryClient();
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const mutate = async (fn: () => Promise<unknown>, itemId?: string) => {
    setError(null);
    if (itemId) setBusyId(itemId);
    try {
      const result = await fn();
      queryClient.setQueryData(['cart'], result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container-page py-6 lg:py-12">
        <Skeleton className="h-8 w-40" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-28 w-24 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-6 lg:py-12">
        <PageHeader title="Your bag" />
        <EmptyState
          title="Your bag is empty"
          description="Items you reserve appear here with a 20-minute countdown."
          action={
            <Link
              href="/products"
              className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors duration-150 hover:bg-accent-hover"
            >
              Browse the outlet
            </Link>
          }
        />

        {/* An empty bag is a dead end otherwise. Saved items come first — the
            customer already chose those. */}
        {cart && cart.savedForLater.length > 0 ? (
          <SavedForLater
            items={cart.savedForLater}
            currency={cart.currencyCode}
            busyId={busyId}
            onRestore={(id) => mutate(() => api.post(`/cart/saved/${id}/restore`), id)}
            onDiscard={(id) => mutate(() => api.delete(`/cart/saved/${id}`), id)}
          />
        ) : null}

        <Recommendations title="Popular in the outlet" />
      </div>
    );
  }

  const liveItems = cart.items.filter((i) => !i.isExpired);

  return (
    <div className="container-page py-6 lg:py-12">
      <PageHeader
        title="Your bag"
        meta={
          <span data-numeric className="text-sm text-ink-500">
            {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
          </span>
        }
      />

      {cart.messages.length > 0 || error ? (
        <div className="mt-6 space-y-3">
          {cart.messages.map((message) => (
            <Alert key={message} tone="warning">
              {message}
            </Alert>
          ))}
          {error ? <Alert tone="error">{error}</Alert> : null}
        </div>
      ) : null}

      <FreeShippingProgress
        progress={cart.freeShipping}
        currency={cart.currencyCode}
        subtotalAfterDiscount={Math.max(0, cart.subtotalMinor - cart.discountMinor)}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <ul className="divide-y divide-line border-b border-t border-line">
          {cart.items.map((item) => (
            <CartRow
              key={item.id}
              item={item}
              currency={cart.currencyCode}
              busy={busyId === item.id}
              onQuantity={(quantity) =>
                mutate(() => api.patch(`/cart/items/${item.id}`, { quantity }), item.id)
              }
              onRemove={() => {
                track('remove_from_cart', {
                  productId: item.productId,
                  variantId: item.variantId,
                  quantity: item.quantity,
                });
                mutate(() => api.delete(`/cart/items/${item.id}`), item.id);
              }}
              onSave={() => {
                track('save_for_later', {
                  productId: item.productId,
                  variantId: item.variantId,
                });
                mutate(() => api.post(`/cart/items/${item.id}/save`), item.id);
              }}
              onExpired={() => refetch()}
            />
          ))}
        </ul>

        {/* In dark the summary becomes a real panel. On white the page frames it
            and a heading plus a rule is enough; on near-black an unbounded
            column of figures beside an unbounded column of items reads as one
            undifferentiated list, and the total stops being the answer. */}
        <aside className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:h-fit dark:rounded-lg dark:border dark:border-line dark:bg-surface-card dark:p-4 dark:sm:p-5">
          <h2 className="text-sm font-semibold text-ink-950">Order summary</h2>

          <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">Subtotal</dt>
              <dd data-numeric className="text-ink-900">
                {formatMoney(cart.subtotalMinor, cart.currencyCode)}
              </dd>
            </div>
            {cart.discountMinor > 0 ? (
              <div className="flex justify-between text-success-700">
                <dt>Coupon ({cart.couponCode})</dt>
                <dd data-numeric>−{formatMoney(cart.discountMinor, cart.currencyCode)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-ink-600">Estimated shipping</dt>
              <dd data-numeric className="text-ink-900">
                {cart.shippingMinor === 0
                  ? 'Free'
                  : formatMoney(cart.shippingMinor, cart.currencyCode)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="text-base font-semibold text-ink-950">Total</dt>
              <dd data-numeric data-testid="cart-total" className="text-lg font-bold text-ink-950">
                {formatMoney(cart.totalMinor, cart.currencyCode)}
              </dd>
            </div>
            <p data-numeric className="text-xs text-ink-500">
              Includes {formatMoney(cart.taxMinor, cart.currencyCode)} VAT
            </p>
          </dl>

          {cart.deliveryEstimate ? (
            <p className="mt-3 text-xs text-ink-600">
              Estimated delivery{' '}
              <span data-numeric className="font-medium text-ink-900">
                {formatDeliveryWindow(cart.deliveryEstimate.earliest, cart.deliveryEstimate.latest)}
              </span>{' '}
              with standard shipping.
            </p>
          ) : null}

          <div className="mt-5 border-t border-line pt-5">
            {cart.couponCode ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-600">
                  Coupon <span className="font-medium text-ink-900">{cart.couponCode}</span>
                </span>
                <button
                  type="button"
                  onClick={() => mutate(() => api.delete('/cart/coupon'))}
                  className="text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!couponCode) return;
                  mutate(async () => {
                    try {
                      const result = await api.post<typeof cart>('/cart/coupon', {
                        code: couponCode,
                      });
                      track('promo_applied', {
                        code: couponCode,
                        discountMinor: result?.discountMinor ?? 0,
                      });
                      return result;
                    } catch (err) {
                      track('promo_rejected', {
                        code: couponCode,
                        reason: err instanceof ApiError ? (err.body.code ?? 'INVALID') : 'INVALID',
                      });
                      throw err;
                    }
                  });
                }}
              >
                <label htmlFor="coupon" className="sr-only">
                  Coupon code
                </label>
                <input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Coupon code"
                  className="h-10 w-full rounded bg-ink-25 px-3 text-sm uppercase ring-1 ring-inset ring-ink-300 transition-shadow duration-150 placeholder:normal-case placeholder:text-ink-400 hover:ring-ink-400 dark:bg-surface-sunken dark:ring-line-strong dark:placeholder:text-content-muted dark:hover:bg-surface dark:hover:ring-ink-600"
                />
                <Button type="submit" variant="secondary">
                  Apply
                </Button>
              </form>
            )}
          </div>

          <Link
            href="/checkout"
            data-testid="go-to-checkout"
            className={cx(
              'mt-6 hidden h-12 items-center justify-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors duration-150 hover:bg-accent-hover lg:flex',
              liveItems.length === 0 && 'pointer-events-none bg-ink-200 text-ink-400',
            )}
          >
            Checkout
          </Link>
          <p className="mt-3 hidden text-xs text-ink-500 lg:block">
            Reservations are released when the countdown ends.
          </p>
        </aside>
      </div>

      {cart.savedForLater.length > 0 ? (
        <SavedForLater
          items={cart.savedForLater}
          currency={cart.currencyCode}
          busyId={busyId}
          onRestore={(id) => mutate(() => api.post(`/cart/saved/${id}/restore`), id)}
          onDiscard={(id) => mutate(() => api.delete(`/cart/saved/${id}`), id)}
        />
      ) : null}

      {/* Mobile: keep checkout reachable without scrolling past every item. */}
      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-line bg-ink-25/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:bg-surface-raised/95 dark:shadow-overlay lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-ink-500">Total</p>
            <p data-numeric className="text-lg font-bold text-ink-950">
              {formatMoney(cart.totalMinor, cart.currencyCode)}
            </p>
          </div>
          <Link
            href="/checkout"
            className={cx(
              'inline-flex h-11 flex-1 max-w-48 items-center justify-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors duration-150 hover:bg-accent-hover',
              liveItems.length === 0 && 'pointer-events-none bg-ink-200 text-ink-400',
            )}
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Free-shipping nudge. Only shown when the threshold is actually reachable and
 * the numbers come from the server, so the bar can never promise a discount the
 * totals will not honour.
 */
function FreeShippingProgress({
  progress,
  currency,
  subtotalAfterDiscount,
}: {
  progress: FreeShippingProgressDto;
  currency: string;
  subtotalAfterDiscount: number;
}) {
  if (progress.thresholdMinor <= 0) return null;

  const percent = Math.min(
    100,
    Math.round((subtotalAfterDiscount / progress.thresholdMinor) * 100),
  );

  return (
    <div className="mt-6 border-y border-line py-4">
      <p className="text-sm text-ink-700">
        {progress.qualified ? (
          <>
            <span className="font-semibold text-success-700">Free standard shipping unlocked.</span>{' '}
            Your order ships at no extra cost.
          </>
        ) : (
          <>
            Add{' '}
            <span data-numeric className="font-semibold text-ink-950">
              {formatMoney(progress.remainingMinor, currency)}
            </span>{' '}
            more to unlock free standard shipping.
          </>
        )}
      </p>
      <div
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-surface-active"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward free shipping"
      >
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            progress.qualified ? 'bg-success-600' : 'bg-ink-950',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** e.g. "Tue 10 – Thu 12 Feb". */
function formatDeliveryWindow(earliest: string, latest: string): string {
  const from = new Date(`${earliest}T00:00:00Z`);
  const to = new Date(`${latest}T00:00:00Z`);
  const day = (date: Date) =>
    date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const month = to.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${day(from)} – ${day(to)} ${month}`;
}

/**
 * Parked items. They hold no reservation, which the copy says plainly — a
 * customer who assumes their size is being held would rightly be annoyed to
 * find it gone.
 */
function SavedForLater({
  items,
  currency,
  busyId,
  onRestore,
  onDiscard,
}: {
  items: CartItemDto[];
  currency: string;
  busyId: string | null;
  onRestore: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <section className="mt-10 border-t border-line pt-6 lg:mt-12 lg:pt-8">
      <h2 className="text-lg font-bold tracking-[-0.02em] text-ink-950">
        Saved for later{' '}
        <span data-numeric className="font-normal text-ink-500">
          ({items.length})
        </span>
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        These are not reserved — stock is released back to other customers until you move them into
        your bag.
      </p>

      <ul className="mt-5 divide-y divide-ink-100 dark:divide-line border-t border-line">
        {items.map((item) => (
          <li
            key={item.id}
            className={cx('flex gap-4 py-4 transition-opacity', busyId === item.id && 'opacity-50')}
          >
            <Link
              href={`/products/${item.productSlug}`}
              className="media-well h-20 w-16 shrink-0 rounded"
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </Link>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
                  {item.brandName}
                </p>
                <h3 className="mt-0.5 text-sm font-medium text-ink-950">
                  <Link href={`/products/${item.productSlug}`} className="hover:underline">
                    {item.productName}
                  </Link>
                </h3>
                <p className="mt-0.5 text-sm text-ink-500">
                  {[item.size ? `Size ${item.size}` : null, item.color].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p data-numeric className="text-sm font-semibold text-ink-950">
                  {formatMoney(item.unitPriceMinor, currency)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRestore(item.id)}
                  disabled={busyId === item.id}
                >
                  Move to bag
                </Button>
                <button
                  type="button"
                  onClick={() => onDiscard(item.id)}
                  disabled={busyId === item.id}
                  className="text-sm text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartRow({
  item,
  currency,
  busy,
  onQuantity,
  onRemove,
  onSave,
  onExpired,
}: {
  item: CartItemDto;
  currency: string;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  onSave: () => void;
  onExpired: () => void;
}) {
  return (
    <li
      className={cx('flex gap-4 py-5 transition-opacity', busy && 'opacity-50')}
      data-testid="cart-item"
    >
      <Link
        href={`/products/${item.productSlug}`}
        className="media-well h-28 w-24 shrink-0 rounded sm:h-32 sm:w-28"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
        <span className="pointer-events-none absolute inset-0 rounded ring-1 ring-inset ring-ink-950/[0.06]" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
              {item.brandName}
            </p>
            <h3 className="mt-0.5 text-sm font-medium text-ink-950">
              <Link href={`/products/${item.productSlug}`} className="hover:underline">
                {item.productName}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              {[item.size ? `Size ${item.size}` : null, item.color].filter(Boolean).join(' · ')}
            </p>
            {item.campaignTitle ? (
              <p className="mt-1 text-xs font-medium text-sale-500">{item.campaignTitle}</p>
            ) : null}
          </div>
          <p data-numeric className="shrink-0 text-sm font-semibold text-ink-950">
            {formatMoney(item.lineTotalMinor, currency)}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 items-center rounded ring-1 ring-inset ring-ink-300 dark:bg-surface-card dark:ring-line-strong">
              <button
                type="button"
                onClick={() => onQuantity(item.quantity - 1)}
                disabled={busy || item.quantity <= 1}
                aria-label="Decrease quantity"
                className="h-full w-8 text-ink-700 transition-colors hover:text-ink-950 disabled:text-ink-300 dark:disabled:text-content-disabled"
              >
                −
              </button>
              <span data-numeric className="w-5 text-center text-sm font-semibold">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => onQuantity(item.quantity + 1)}
                disabled={busy}
                aria-label="Increase quantity"
                className="h-full w-8 text-ink-700 transition-colors hover:text-ink-950 disabled:text-ink-300 dark:disabled:text-content-disabled"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="text-sm text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
            >
              Save for later
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-sm text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
            >
              Remove
            </button>
          </div>

          {item.reservation && !item.isExpired ? (
            <p className="text-sm text-ink-600">
              Reserved <Countdown expiresAt={item.reservation.expiresAt} onExpired={onExpired} />
            </p>
          ) : (
            <p className="text-sm font-medium text-sale-500">Reservation expired</p>
          )}
        </div>
      </div>
    </li>
  );
}
