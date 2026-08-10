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
  const { t, money } = useI18n();
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
        text: t('product.addedToBag'),
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.body.code === 'OUT_OF_STOCK') {
        setFeedback({
          tone: 'error',
          text: t('product.justTaken'),
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
      setFeedback({ tone: 'success', text: t('product.savedToWishlist') });
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
            'price-now text-3xl',
            product.discountPercent > 0 && 'price-now--reduced',
          )}
        >
          {money(price)}
        </span>
        {product.discountPercent > 0 ? (
          <>
            <span data-numeric className="price-was text-base">
              {money(product.originalPriceMinor)}
            </span>
            {/* The saving is the one place a tinted chip earns its keep: it
                states a number the struck price only implies. `sale-50` is a
                deep tint in dark, not the pale wash it is on white. */}
            <span
              data-numeric
              className="rounded-xs bg-sale-50 px-1.5 py-0.5 text-sm font-semibold text-sale-600 dark:bg-sale-100 dark:text-sale-700"
            >
              {t('product.save', { amount: money(product.originalPriceMinor - price) })}
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-ink-500">
        {t('product.inclVat')}
        {product.campaignSlug ? (
          <>
            {' · '}
            <span className="font-medium text-sale-500">{t('product.campaignPrice')}</span>
          </>
        ) : null}
      </p>

      {/* Colour */}
      {colors.length > 1 ? (
        <fieldset className="mt-7">
          <legend className="mb-2.5 flex w-full items-baseline justify-between text-sm">
            <span className="font-semibold text-ink-950">{t('product.colour')}</span>
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
                    'relative h-9 w-9 rounded-full transition-shadow duration-150',
                    // The ring is drawn in the *content* colour at low alpha,
                    // so it reads against a white swatch on a dark panel and a
                    // black swatch on a white one alike.
                    active
                      ? 'ring-2 ring-ink-950 ring-offset-2 ring-offset-ink-25'
                      : 'ring-1 ring-inset ring-ink-950/20 hover:ring-ink-500 dark:ring-ink-950/25 dark:hover:ring-ink-700',
                    !available && 'opacity-40 saturate-50',
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
            {sizeError ? t('product.selectSize') : t('product.size')}
          </span>
          <SizeGuide
            sizes={product.variants.map((v) => v.size)}
            targetGroup={product.targetGroup}
          />
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
                // Four states that have to be told apart at a glance:
                //   selected     solid block, maximum contrast
                //   default      outlined, on its own surface in dark
                //   hover        border strengthens and the surface lifts
                //   unavailable  struck, dimmed, but still legible — an
                //                invisible sold-out size just reads as a
                //                rendering bug
                className={cx(
                  'relative h-11 rounded text-sm font-medium transition-[background-color,box-shadow,color] duration-150',
                  active && 'bg-ink-950 text-ink-25',
                  !active &&
                    !disabled &&
                    'text-ink-900 ring-1 ring-inset ring-ink-300 hover:ring-ink-950 dark:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600',
                  disabled &&
                    'cursor-not-allowed text-ink-300 ring-1 ring-inset ring-ink-100 line-through dark:bg-surface-sunken/60 dark:text-content-disabled dark:ring-line',
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
            {t('product.lastSize')}
          </p>
        ) : null}
      </fieldset>

      {/* Quantity + actions */}
      <div ref={ctaRef} className="mt-7">
        <div className="flex items-stretch gap-2">
          <div className="flex h-12 shrink-0 items-center rounded ring-1 ring-inset ring-ink-300 dark:bg-surface-card dark:ring-line-strong">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label={t('product.decrease')}
              className="h-full w-10 text-lg text-ink-700 transition-colors hover:text-ink-950 disabled:text-ink-300 dark:disabled:text-content-disabled"
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
              aria-label={t('product.increase')}
              className="h-full w-10 text-lg text-ink-700 transition-colors hover:text-ink-950 disabled:text-ink-300 dark:disabled:text-content-disabled"
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
            {soldOut ? t('product.soldOut') : t('product.addToBag')}
          </Button>

          <button
            type="button"
            onClick={handleWishlist}
            aria-label={t('product.saveToWishlist')}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded text-ink-700 ring-1 ring-inset ring-ink-300 transition-colors duration-150 hover:text-sale-500 hover:ring-ink-400 dark:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600"
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
            {t('product.buyNow')}
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
      <ul className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
        <TrustRow icon={<TruckIcon className="h-[18px] w-[18px]" />} title={t('product.delivery')}>
          Standard {money(495)}, 3–5 working days. Free over{' '}
          {money(10000)}. Express 1–2 days at checkout.
        </TrustRow>
        <TrustRow icon={<ReturnIcon className="h-[18px] w-[18px]" />} title={t('product.freeReturns')}>
          30 days from delivery. Request a return from your order page — no reason needed.
        </TrustRow>
        <TrustRow icon={<ShieldIcon className="h-[18px] w-[18px]" />} title={t('product.secureCheckout')}>
          Card or cash on delivery. Card details are never stored by this shop.
        </TrustRow>
      </ul>

      <p className="mt-5 text-xs leading-relaxed text-ink-500">
        {t('product.reserveNote')}
      </p>

      {/* Mobile sticky bar — only once the real button is out of view. */}
      <div
        className={cx(
          // Overlays the page, so it takes the raised surface rather than the
          // page colour it would otherwise share with the content behind it.
          'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-25/95 px-4 py-3 backdrop-blur transition-transform duration-200 dark:border-line dark:bg-surface-raised/95 dark:shadow-overlay lg:hidden',
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
              {money(price)}
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
