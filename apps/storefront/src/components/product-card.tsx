'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ProductListItemDto } from '@outlet/types';
import { HeartIcon, ImageIcon, Skeleton, StarRating, cx, formatMoney } from '@outlet/ui';
import { useToggleWishlist } from '@/lib/hooks';

/**
 * Product tile.
 *
 * Deliberately not a bordered card: the image tile carries the visual weight
 * and the metadata sits on the page beneath it, so a grid reads as a rhythm of
 * products rather than a wall of boxes. Only two things earn colour — the
 * reduced price and a genuine scarcity warning.
 *
 * The hover state does the work a second visit would otherwise cost: the
 * alternate shot fades in, and saving becomes possible without opening the
 * product at all.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductListItemDto;
  /** Skips lazy-loading for above-the-fold tiles. */
  priority?: boolean;
}) {
  const soldOut = product.totalAvailable <= 0;
  const lastFew = !soldOut && product.totalAvailable <= 3;
  const discounted = product.discountPercent > 0;
  const wishlist = useToggleWishlist();
  const [hovered, setHovered] = useState(false);

  const secondary = product.hoverImageUrl ?? null;

  return (
    <article
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded bg-ink-50">
        {product.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className={cx(
                'h-full w-full object-cover transition-[transform,opacity] duration-500 ease-out',
                secondary ? 'group-hover:opacity-0' : 'group-hover:scale-[1.03]',
                soldOut && 'opacity-60',
              )}
            />
            {secondary ? (
              // Only fetched once the pointer arrives: a second image per tile
              // across a 24-tile grid is a lot to download for a hover state
              // most visitors never trigger.
              hovered ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={secondary}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  className={cx(
                    'absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out',
                    'group-hover:opacity-100',
                    soldOut && 'opacity-60',
                  )}
                />
              ) : null
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-300">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}

        {/* Hairline keeps pale product images from bleeding into the page. */}
        <div className="pointer-events-none absolute inset-0 rounded ring-1 ring-inset ring-ink-950/[0.06]" />

        {discounted ? (
          <span
            data-numeric
            className="absolute left-2 top-2 rounded-xs bg-sale-500 px-1.5 py-0.5 text-2xs font-bold tracking-[0.02em] text-white"
          >
            −{product.discountPercent}%
          </span>
        ) : null}

        {/* Above the link overlay so it stays clickable. Always visible on
            touch, where there is no hover to reveal it. */}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            wishlist.toggle(product.id);
          }}
          aria-label={
            wishlist.contains(product.id)
              ? `Remove ${product.name} from wishlist`
              : `Save ${product.name} to wishlist`
          }
          aria-pressed={wishlist.contains(product.id)}
          className={cx(
            'absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full',
            'bg-ink-25/85 backdrop-blur transition',
            'focus-visible:opacity-100 group-hover:opacity-100 lg:opacity-0',
            wishlist.contains(product.id)
              ? 'text-sale-500 lg:opacity-100'
              : 'text-ink-600 hover:text-ink-950',
          )}
        >
          <HeartIcon className={cx('h-4 w-4', wishlist.contains(product.id) && 'fill-current')} />
        </button>

        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-ink-950/85 py-1.5 text-center text-2xs font-semibold uppercase tracking-[0.08em] text-ink-25">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="pt-3">
        <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
          {product.brand.name}
        </p>
        <h3 className="mt-1 text-sm font-medium leading-snug text-ink-900">
          <Link href={`/products/${product.slug}`} className="before:absolute before:inset-0">
            <span className="line-clamp-2 group-hover:underline group-hover:decoration-ink-300 group-hover:underline-offset-2">
              {product.name}
            </span>
          </Link>
        </h3>

        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            data-numeric
            className={cx('text-sm font-semibold', discounted ? 'text-sale-500' : 'text-ink-900')}
          >
            {formatMoney(product.currentPriceMinor, product.currencyCode)}
          </span>
          {discounted ? (
            <span data-numeric className="text-xs text-ink-400 line-through">
              {formatMoney(product.originalPriceMinor, product.currencyCode)}
            </span>
          ) : null}
        </div>

        {/* Social proof sits under the price: it supports the decision the
            price just prompted, and stays quiet when a product has no reviews
            rather than showing an empty five-star rail. */}
        {product.ratingAverage !== null && product.reviewCount > 0 ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <StarRating value={product.ratingAverage} size="sm" />
            <span data-numeric className="text-xs text-ink-500">
              {product.ratingAverage.toFixed(1)} ({product.reviewCount})
            </span>
          </div>
        ) : null}

        {product.colors && product.colors.length > 1 ? (
          <p className="mt-1.5 text-xs text-ink-500">{product.colors.length} colours</p>
        ) : null}

        {lastFew ? (
          <p data-numeric className="mt-1 text-xs text-warning-600">
            Only {product.totalAvailable} left
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** Shared responsive grid: 2 up on phones, 4 on desktop. */
export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductListItemDto[];
  priorityCount?: number;
}) {
  if (products.length === 0) {
    return (
      <p className="border-t border-ink-200 py-16 text-center text-sm text-ink-500">
        No products found.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

/** Matches ProductGrid's rhythm so the page does not reflow when data lands. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/5] w-full" />
          <Skeleton className="mt-3 h-2.5 w-16" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
