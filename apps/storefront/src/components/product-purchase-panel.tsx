'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductDetailDto } from '@outlet/types';
import { Alert, Button, HeartIcon, cx, formatMoney } from '@outlet/ui';
import { useAddToCart, useCurrentUser } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';

const COLOR_HEX: Record<string, string> = {
  Black: '#1f2937',
  White: '#e5e7eb',
  Red: '#dc2626',
  Blue: '#2563eb',
  Navy: '#1e3a5f',
  Green: '#16a34a',
  Grey: '#6b7280',
  Beige: '#d6c7a1',
  Pink: '#ec4899',
  Orange: '#ea580c',
};

const MAX_QUANTITY = 5;

export function ProductPurchasePanel({ product }: { product: ProductDetailDto }) {
  const router = useRouter();
  const addToCart = useAddToCart();
  const { data: me } = useCurrentUser();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants.length === 1 ? product.variants[0].id : null,
  );
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const selectedVariant = useMemo(
    () => product.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product.variants, selectedVariantId],
  );

  const colors = [...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[];
  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);
  const sizeVariants = product.variants.filter((v) => !selectedColor || v.color === selectedColor);

  const price = selectedVariant?.priceMinor ?? product.currentPriceMinor;
  const soldOut = product.totalAvailable <= 0;
  const maxForVariant = Math.min(MAX_QUANTITY, selectedVariant?.availableQuantity ?? MAX_QUANTITY);

  const handleAdd = async () => {
    if (!selectedVariant) {
      setFeedback({ tone: 'error', text: 'Please select a size first.' });
      return;
    }
    setFeedback(null);
    try {
      await addToCart.mutateAsync({
        variantId: selectedVariant.id,
        quantity,
        campaignId: product.campaignId,
      });
      setFeedback({
        tone: 'success',
        text: 'Added to your bag — reserved for the next 20 minutes.',
      });
    } catch (err) {
      if (err instanceof ApiError && err.body.code === 'OUT_OF_STOCK') {
        setFeedback({
          tone: 'error',
          text: 'Sorry — this item was just taken by another customer.',
        });
      } else {
        setFeedback({ tone: 'error', text: (err as Error).message });
      }
    }
  };

  const handleWishlist = async () => {
    if (!me?.user) {
      router.push('/login');
      return;
    }
    try {
      await api.post('/account/wishlist', { productId: product.id });
      setFeedback({ tone: 'success', text: 'Saved to your wishlist.' });
    } catch (err) {
      setFeedback({ tone: 'error', text: (err as Error).message });
    }
  };

  return (
    <div>
      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          data-numeric
          className={cx(
            'text-3xl font-bold tracking-[-0.02em]',
            product.discountPercent > 0 ? 'text-sale-500' : 'text-ink-950',
          )}
        >
          {formatMoney(price, product.currencyCode)}
        </span>
        {product.discountPercent > 0 ? (
          <>
            <span data-numeric className="text-base text-ink-400 line-through">
              {formatMoney(product.originalPriceMinor, product.currencyCode)}
            </span>
            <span data-numeric className="text-sm font-semibold text-sale-500">
              −{product.discountPercent}%
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-ink-500">
        Incl. VAT
        {product.campaignSlug ? (
          <>
            {' · '}
            <span className="font-medium text-sale-500">Campaign price applied</span>
          </>
        ) : null}
      </p>

      {/* Colour */}
      {colors.length > 1 ? (
        <fieldset className="mt-7">
          <legend className="mb-2.5 flex w-full items-baseline justify-between text-sm">
            <span className="font-semibold text-ink-950">Colour</span>
            <span className="text-ink-500">{selectedColor}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const active = selectedColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={active}
                  aria-label={color}
                  onClick={() => {
                    setSelectedColor(color);
                    setSelectedVariantId(null);
                    setQuantity(1);
                  }}
                  className={cx(
                    'relative h-9 w-9 rounded-full transition-shadow',
                    active
                      ? 'ring-2 ring-ink-950 ring-offset-2'
                      : 'ring-1 ring-inset ring-ink-950/15 hover:ring-ink-400',
                  )}
                  style={{ backgroundColor: COLOR_HEX[color] ?? '#9ca3af' }}
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Size */}
      <fieldset className="mt-7">
        <legend className="mb-2.5 text-sm font-semibold text-ink-950">Size</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {sizeVariants.map((variant) => {
            const disabled = variant.availableQuantity <= 0;
            const active = selectedVariantId === variant.id;
            return (
              <button
                key={variant.id}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => {
                  setSelectedVariantId(variant.id);
                  setQuantity(1);
                  setFeedback(null);
                }}
                data-testid={`variant-${variant.sku}`}
                className={cx(
                  'relative h-11 rounded text-sm font-medium transition-colors',
                  active && 'bg-ink-950 text-ink-25',
                  !active &&
                    !disabled &&
                    'text-ink-900 ring-1 ring-inset ring-ink-300 hover:ring-ink-950',
                  disabled &&
                    'cursor-not-allowed text-ink-300 ring-1 ring-inset ring-ink-100 line-through',
                )}
              >
                {variant.size ?? variant.sku}
              </button>
            );
          })}
        </div>
        {selectedVariant && selectedVariant.availableQuantity > 0 && selectedVariant.availableQuantity <= 3 ? (
          <p data-numeric className="mt-2.5 text-sm font-medium text-warning-600">
            Only {selectedVariant.availableQuantity} left in this size
          </p>
        ) : null}
      </fieldset>

      {/* Quantity + actions */}
      <div className="mt-7 flex items-stretch gap-2">
        <div className="flex h-12 shrink-0 items-center rounded ring-1 ring-inset ring-ink-300">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
            className="h-full w-10 text-lg text-ink-700 transition-colors hover:text-ink-950 disabled:text-ink-300"
          >
            −
          </button>
          <span data-numeric className="w-6 text-center text-sm font-semibold text-ink-950">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxForVariant, q + 1))}
            disabled={quantity >= maxForVariant}
            aria-label="Increase quantity"
            className="h-full w-10 text-lg text-ink-700 transition-colors hover:text-ink-950 disabled:text-ink-300"
          >
            +
          </button>
        </div>

        <Button
          size="lg"
          onClick={handleAdd}
          loading={addToCart.isPending}
          disabled={soldOut}
          data-testid="add-to-cart"
          className="flex-1"
        >
          {soldOut ? 'Sold out' : 'Add to bag'}
        </Button>

        <button
          type="button"
          onClick={handleWishlist}
          aria-label="Save to wishlist"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded text-ink-700 ring-1 ring-inset ring-ink-300 transition-colors hover:text-sale-500 hover:ring-ink-400"
        >
          <HeartIcon className="h-5 w-5" />
        </button>
      </div>

      {feedback ? (
        <div className="mt-4" data-testid="purchase-feedback">
          <Alert tone={feedback.tone === 'success' ? 'success' : 'error'}>{feedback.text}</Alert>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-ink-500">
        Items in your bag are reserved for 20 minutes. The timer does not restart when you refresh
        or sign in.
      </p>
    </div>
  );
}
