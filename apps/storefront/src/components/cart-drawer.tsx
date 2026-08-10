'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import type { CartItemDto } from '@outlet/types';
import { BagIcon, Button, CloseIcon, TruckIcon, cx, formatMoney } from '@outlet/ui';
import { useCart } from '@/lib/hooks';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { FreeShippingBar } from './free-shipping-bar';

/**
 * Mini bag.
 *
 * Opens in place of navigating to /cart, because the moment after adding an
 * item is the worst possible time to take someone off the page they were
 * shopping. It shows enough to confirm the add was real — image, variant,
 * price, running total — and offers exactly two ways out: keep shopping, or
 * check out.
 */
export function CartDrawer({ onClose }: { onClose: () => void }) {
  const { data: cart, isLoading, refetch } = useCart();
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  /**
   * Cart mutations can legitimately fail — the last unit of a size can go while
   * the drawer is open. Swallowing that would leave the quantity looking
   * changed when it is not, so the reason is surfaced and the cart re-read from
   * the server rather than patched optimistically.
   */
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      queryClient.setQueryData(['cart'], await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      refetch();
    }
  };

  const remove = (item: CartItemDto) =>
    run(async () => {
      const next = await api.delete(`/cart/items/${item.id}`);
      track('remove_from_cart', {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
      return next;
    });

  const setQuantity = (itemId: string, quantity: number) =>
    run(() => api.patch(`/cart/items/${itemId}`, { quantity }));

  const items = cart?.items ?? [];
  const currency = cart?.currencyCode ?? 'EUR';

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your bag">
      <button
        type="button"
        aria-label="Close bag"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-scrim-950/50 dark:bg-scrim-950/70"
      />

      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-[min(26rem,92vw)] animate-slide-in-right flex-col bg-ink-25 shadow-md dark:border-l dark:border-line dark:bg-surface-raised dark:shadow-lg"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-950">
            <BagIcon className="h-[18px] w-[18px]" />
            Your bag
            {items.length > 0 ? (
              <span data-numeric className="text-ink-500">
                ({cart?.itemCount})
              </span>
            ) : null}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close bag"
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 p-4">
            <div className="skeleton h-24 w-full rounded" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-400 dark:bg-surface-active">
              <BagIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base font-semibold text-ink-950">Your bag is empty</p>
              <p className="mt-1 text-sm text-ink-500">
                Items you reserve are held for 20 minutes while you decide.
              </p>
            </div>
            <Link
              href="/products"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors duration-150 hover:bg-accent-hover"
            >
              Browse the outlet
            </Link>
          </div>
        ) : (
          <>
            {cart?.freeShipping ? (
              <div className="shrink-0 border-b border-ink-100 px-4 py-3">
                <FreeShippingBar progress={cart.freeShipping} currency={currency} />
              </div>
            ) : null}

            <ul className="min-h-0 flex-1 divide-y divide-ink-100 dark:divide-line overflow-y-auto overscroll-contain px-4">
              {items.map((item) => (
                <DrawerLine
                  key={item.id}
                  item={item}
                  currency={currency}
                  onClose={onClose}
                  onRemove={() => remove(item)}
                  onQuantity={(q) => setQuantity(item.id, q)}
                />
              ))}
            </ul>

            <div className="shrink-0 border-t border-line p-4">
              {error ? (
                <p
                  role="alert"
                  className="mb-3 rounded bg-sale-50 px-3 py-2 text-xs font-medium text-sale-600"
                >
                  {error}
                </p>
              ) : null}

              {cart?.deliveryEstimate ? (
                <p className="mb-3 flex items-center gap-2 text-xs text-ink-500">
                  <TruckIcon className="h-4 w-4 shrink-0" />
                  Estimated delivery {formatEstimate(cart.deliveryEstimate.earliest)} –{' '}
                  {formatEstimate(cart.deliveryEstimate.latest)}
                </p>
              ) : null}

              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-600">Subtotal</span>
                <span data-numeric className="text-lg font-bold text-ink-950">
                  {formatMoney(cart?.subtotalMinor ?? 0, currency)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Shipping and any discounts are calculated at checkout.
              </p>

              <Link href="/checkout" onClick={onClose} className="mt-3 block">
                <Button size="lg" className="w-full">
                  Checkout
                </Button>
              </Link>
              <Link
                href="/cart"
                onClick={onClose}
                className="mt-2 block text-center text-sm text-ink-600 underline underline-offset-2 transition-colors hover:text-ink-950"
              >
                View full bag
              </Link>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DrawerLine({
  item,
  currency,
  onClose,
  onRemove,
  onQuantity,
}: {
  item: CartItemDto;
  currency: string;
  onClose: () => void;
  onRemove: () => void;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <li className="flex gap-3 py-4">
      <Link
        href={`/products/${item.productSlug}`}
        onClick={onClose}
        className="media-well shrink-0 rounded-xs"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-24 w-[76px] object-cover" loading="lazy" />
        ) : (
          <span className="block h-24 w-[76px]" />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
          {item.brandName}
        </p>
        <Link
          href={`/products/${item.productSlug}`}
          onClick={onClose}
          className="mt-0.5 block truncate text-sm font-medium text-ink-900 hover:underline"
        >
          {item.productName}
        </Link>
        <p className="mt-0.5 text-xs text-ink-500">
          {[item.size && `Size ${item.size}`, item.color].filter(Boolean).join(' · ')}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex h-8 items-center rounded ring-1 ring-inset ring-ink-200">
            <button
              type="button"
              onClick={() => (item.quantity > 1 ? onQuantity(item.quantity - 1) : onRemove())}
              aria-label={item.quantity > 1 ? 'Decrease quantity' : 'Remove item'}
              className="h-full w-7 text-ink-600 transition-colors hover:text-ink-950"
            >
              −
            </button>
            <span data-numeric className="w-5 text-center text-xs font-semibold text-ink-950">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantity(item.quantity + 1)}
              aria-label="Increase quantity"
              className="h-full w-7 text-ink-600 transition-colors hover:text-ink-950"
            >
              +
            </button>
          </div>

          <span
            data-numeric
            className={cx(
              'text-sm font-semibold',
              item.originalUnitPriceMinor > item.unitPriceMinor ? 'text-sale-500' : 'text-ink-950',
            )}
          >
            {formatMoney(item.lineTotalMinor, currency)}
          </span>
        </div>
      </div>
    </li>
  );
}

const ESTIMATE_FORMAT = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function formatEstimate(iso: string): string {
  return ESTIMATE_FORMAT.format(new Date(iso));
}
