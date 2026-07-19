'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductDetailDto } from '@outlet/types';
import { formatMoney } from '@outlet/ui';
import { useAddToCart, useCurrentUser } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';

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
        text: 'Added to cart — reserved for you for the next 20 minutes.',
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
    <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-2xl font-bold text-red-600">
        {formatMoney(price, product.currencyCode)}{' '}
        {product.discountPercent > 0 ? (
          <>
            <span className="text-base font-normal text-gray-400 line-through">
              {formatMoney(product.originalPriceMinor, product.currencyCode)}
            </span>{' '}
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
              -{product.discountPercent}%
            </span>
          </>
        ) : null}
      </p>
      {product.campaignSlug ? (
        <p className="mt-1 text-xs font-medium text-red-600">Campaign price applied</p>
      ) : null}
      <p className="mt-0.5 text-xs text-gray-500">Price includes VAT</p>

      {colors.length > 1 ? (
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium">Color</p>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  setSelectedColor(color);
                  setSelectedVariantId(null);
                }}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  selectedColor === color
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 hover:border-gray-500'
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-1 text-sm font-medium">Size</p>
        <div className="flex flex-wrap gap-2">
          {sizeVariants.map((variant) => {
            const disabled = variant.availableQuantity <= 0;
            return (
              <button
                key={variant.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedVariantId(variant.id)}
                data-testid={`variant-${variant.sku}`}
                className={`relative rounded-md border px-3 py-1.5 text-sm ${
                  selectedVariantId === variant.id
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : disabled
                      ? 'cursor-not-allowed border-gray-200 text-gray-300 line-through'
                      : 'border-gray-300 hover:border-gray-500'
                }`}
              >
                {variant.size ?? variant.sku}
                {!disabled && variant.availableQuantity <= 3 ? (
                  <span className="ml-1 text-[10px] text-amber-600">
                    ({variant.availableQuantity})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {selectedVariant && selectedVariant.availableQuantity <= 3 ? (
          <p className="mt-1 text-xs font-medium text-amber-600">
            Only {selectedVariant.availableQuantity} left in this size!
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          Qty
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1.5"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={addToCart.isPending || product.totalAvailable <= 0}
          data-testid="add-to-cart"
          className="flex-1 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {product.totalAvailable <= 0
            ? 'Sold out'
            : addToCart.isPending
              ? 'Adding…'
              : 'Add to cart'}
        </button>
        <button
          type="button"
          onClick={handleWishlist}
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm hover:border-gray-900"
          aria-label="Add to wishlist"
        >
          ♥
        </button>
      </div>

      {feedback ? (
        <p
          className={`mt-3 text-sm ${feedback.tone === 'success' ? 'text-green-700' : 'text-red-600'}`}
          data-testid="purchase-feedback"
        >
          {feedback.text}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-gray-500">
        Items in your cart are reserved for 20 minutes. The timer does not restart when you refresh
        or log in.
      </p>
    </div>
  );
}
