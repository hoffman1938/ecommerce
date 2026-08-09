'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductDetailDto } from '@outlet/types';
import { COLOR_HEX } from '@outlet/catalog';
import {
  Alert,
  Button,
  HeartIcon,
  ReturnIcon,
  ShieldIcon,
  TruckIcon,
  cx,
  formatMoney,
} from '@outlet/ui';
import { useAddToCart, useCurrentUser } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { SizeGuide } from '@/components/size-guide';

const MAX_QUANTITY = 5;
/** Below this, a size is called out as nearly gone. Backed by real inventory. */
const LOW_STOCK_THRESHOLD = 3;

export function ProductPurchasePanel({
  product,
  colors,
  selectedColor,
  onSelectColor,
}: {
  product: ProductDetailDto;
  colors: string[];
  selectedColor: string | null;
  onSelectColor: (color: string) => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const addToCart = useAddToCart();
  const { data: me } = useCurrentUser();

  const sizeVariants = useMemo(
    () => product.variants.filter((v) => !selectedColor || v.color === selectedColor),
    [product.variants, selectedColor],
  );

  // A product with exactly one buyable variant needs no size step at all.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants.length === 1 ? product.variants[0].id : null,
  );
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  const sizeGridRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaOffscreen, setCtaOffscreen] = useState(false);

  const selectedVariant = useMemo(
    () => product.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product.variants, selectedVariantId],
  );

  // Changing colour invalidates the chosen size — the same size in another
  // colourway is a different variant with its own stock.
  useEffect(() => {
    setSelectedVariantId((current) => {
      if (!current) return current;
      return sizeVariants.some((v) => v.id === current) ? current : null;
    });
    setQuantity(1);
  }, [sizeVariants]);

  /**
   * Drives the mobile sticky bar.
   *
   * It appears only once the real Add to bag button has been scrolled *past* —
   * not merely whenever it is off screen. Showing it on arrival would put a
   * buy button in front of someone who has not yet seen the gallery or picked a
   * size, and would leave two Add to bag controls competing on the same screen.
   */
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaOffscreen(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const price = selectedVariant?.priceMinor ?? product.currentPriceMinor;
  const soldOut = product.totalAvailable <= 0;
  const maxForVariant = Math.min(MAX_QUANTITY, selectedVariant?.availableQuantity ?? MAX_QUANTITY);
  const inStockSizes = sizeVariants.filter((v) => v.availableQuantity > 0);
  const lastSize = !soldOut && inStockSizes.length === 1 && sizeVariants.length > 1;

  const requireSize = () => {
    setSizeError(true);
    sizeGridRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  };

  const addToBag = async (): Promise<boolean> => {
    if (!selectedVariant) return requireSize();
    setSizeError(false);
    setFeedback(null);
    try {
      await addToCart.mutateAsync({
        variantId: selectedVariant.id,
        quantity,
        campaignId: product.campaignId,
      });
      track('add_to_cart', {
        productId: product.id,
        variantId: selectedVariant.id,
        quantity,
        priceMinor: selectedVariant.priceMinor,
      });
      setFeedback({
        tone: 'success',
        text: 'Added to your bag — reserved for the next 20 minutes.',
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.body.code === 'OUT_OF_STOCK') {
        setFeedback({
          tone: 'error',
          text: 'Sorry — this item was just taken by another customer.',
        });
      } else {
        setFeedback({ tone: 'error', text: (err as Error).message });
      }
      return false;
    }
  };

  /** Same path as Add to bag, then straight to checkout — no separate flow. */
  const buyNow = async () => {
    if (await addToBag()) router.push('/cart');
  };

  const handleWishlist = async () => {
    if (!me?.user) {
      router.push('/login');
      return;
    }
    try {
      await api.post('/account/wishlist', { productId: product.id });
      track('wishlist_add', { productId: product.id });
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
            <span
              data-numeric
              className="rounded-xs bg-sale-50 px-1.5 py-0.5 text-sm font-semibold text-sale-600"
            >
              Save {formatMoney(product.originalPriceMinor - price, product.currencyCode)}
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-ink-500">
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
          <div className="flex flex-wrap gap-2.5">
            {colors.map((color) => {
              const active = selectedColor === color;
              const available = product.variants.some(
                (v) => v.color === color && v.availableQuantity > 0,
              );
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={active}
                  aria-label={available ? color : `${color} — sold out`}
                  title={color}
                  onClick={() => onSelectColor(color)}
                  className={cx(
                    'relative h-9 w-9 rounded-full transition-shadow',
                    active
                      ? 'ring-2 ring-ink-950 ring-offset-2 ring-offset-ink-25'
                      : 'ring-1 ring-inset ring-ink-950/20 hover:ring-ink-500',
                    !available && 'opacity-45',
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
        <legend className="mb-2.5 flex w-full items-baseline justify-between gap-4 text-sm">
          <span className={cx('font-semibold', sizeError ? 'text-sale-600' : 'text-ink-950')}>
            {sizeError ? 'Select a size to continue' : 'Size'}
          </span>
          <SizeGuide sizes={product.variants.map((v) => v.size)} />
        </legend>
        <div
          ref={sizeGridRef}
          className={cx(
            'grid grid-cols-4 gap-2 rounded sm:grid-cols-5',
            sizeError && 'ring-2 ring-sale-400 ring-offset-4 ring-offset-ink-25',
          )}
        >
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
                  setSizeError(false);
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

        {/* Scarcity, but only ever what the inventory actually says. */}
        {selectedVariant &&
        selectedVariant.availableQuantity > 0 &&
        selectedVariant.availableQuantity <= LOW_STOCK_THRESHOLD ? (
          <p data-numeric className="mt-2.5 text-sm font-medium text-warning-600">
            {t('product.onlyLeft', { count: selectedVariant.availableQuantity })}
          </p>
        ) : lastSize ? (
          <p className="mt-2.5 text-sm font-medium text-warning-600">
            Last size available in this colour
          </p>
        ) : null}
      </fieldset>

      {/* Quantity + actions */}
      <div ref={ctaRef} className="mt-7">
        <div className="flex items-stretch gap-2">
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
            onClick={addToBag}
            loading={addToCart.isPending}
            disabled={soldOut}
            data-testid="add-to-cart"
            className="flex-1"
          >
            {soldOut ? t('product.soldOut') : 'Add to bag'}
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

        {!soldOut ? (
          <Button
            size="lg"
            variant="secondary"
            onClick={buyNow}
            disabled={addToCart.isPending}
            className="mt-2 w-full"
          >
            Buy now
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <div className="mt-4" data-testid="purchase-feedback">
          <Alert tone={feedback.tone === 'success' ? 'success' : 'error'}>{feedback.text}</Alert>
        </div>
      ) : null}

      {/* The three questions people ask before committing: when does it arrive,
          what if it doesn't fit, and is paying here safe. Answering them here
          rather than in the footer is the point. */}
      <ul className="mt-6 space-y-3 border-t border-ink-200 pt-5 text-sm">
        <TrustRow icon={<TruckIcon className="h-[18px] w-[18px]" />} title="Delivery">
          Standard {formatMoney(495, product.currencyCode)}, 3–5 working days. Free over{' '}
          {formatMoney(10000, product.currencyCode)}. Express 1–2 days at checkout.
        </TrustRow>
        <TrustRow icon={<ReturnIcon className="h-[18px] w-[18px]" />} title="Free returns">
          30 days from delivery. Request a return from your order page — no reason needed.
        </TrustRow>
        <TrustRow icon={<ShieldIcon className="h-[18px] w-[18px]" />} title="Secure checkout">
          Card or cash on delivery. Card details are never stored by this shop.
        </TrustRow>
      </ul>

      <p className="mt-5 text-xs leading-relaxed text-ink-500">
        Items in your bag are reserved for 20 minutes. The timer does not restart when you refresh
        or sign in.
      </p>

      {/* Mobile sticky bar — only once the real button is out of view. */}
      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-ink-25/95 px-4 py-3 backdrop-blur transition-transform duration-200 lg:hidden',
          'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
          ctaOffscreen && !soldOut ? 'translate-y-0' : 'translate-y-full',
        )}
        aria-hidden={!ctaOffscreen}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-500">
              {selectedVariant?.size ? `Size ${selectedVariant.size}` : 'Select a size'}
              {selectedColor ? ` · ${selectedColor}` : ''}
            </p>
            <p
              data-numeric
              className={cx(
                'text-base font-bold',
                product.discountPercent > 0 ? 'text-sale-500' : 'text-ink-950',
              )}
            >
              {formatMoney(price, product.currencyCode)}
            </p>
          </div>
          <Button
            onClick={addToBag}
            loading={addToCart.isPending}
            disabled={soldOut}
            tabIndex={ctaOffscreen ? 0 : -1}
            className="shrink-0 px-8"
          >
            Add to bag
          </Button>
        </div>
      </div>
    </div>
  );
}

function TrustRow({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-ink-500" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-ink-950">{title}</span>{' '}
        <span className="text-ink-600">{children}</span>
      </span>
    </li>
  );
}
