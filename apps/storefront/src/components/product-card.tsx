'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ProductListItemDto } from '@outlet/types';
import { HeartIcon, ImageIcon, Skeleton, StarRating, cx } from '@outlet/ui';
import { useToggleWishlist } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

/**
 * Product tile.
 *
 * In light mode this is deliberately not a bordered card: the image tile
 * carries the visual weight and the metadata sits on the page beneath it, so a
 * grid reads as a rhythm of products rather than a wall of boxes.
 *
 * Dark mode takes the opposite decision, via `dark:` variants. That inversion
 * of approach is the point: on white, the page itself frames a tile, and a
 * border would be noise. On near-black there is nothing to frame it — an
 * unbounded image floats, the metadata beneath it belongs to no particular
 * product, and a grid dissolves into a field of rectangles. So dark gets a real
 * card: `surface-card` a step above the page, a hairline, and padding that
 * gathers the image and its metadata into one object.
 *
 * WHAT DOES NOT INVERT
 * The catalogue is shot on off-white, so the image is a *light* object in both
 * themes. Everything that sits on top of it — badge, wishlist control, sold-out
 * bar — is therefore pinned to fixed colours rather than theme tokens. Letting
 * those follow the theme is what produced white-on-white badges and a dark
 * wishlist pill on a pale shoe.
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
  const { money } = useI18n();
  const soldOut = product.totalAvailable <= 0;
  const lastFew = !soldOut && product.totalAvailable <= 3;
  const discounted = product.discountPercent > 0;
  const wishlist = useToggleWishlist();
  const [hovered, setHovered] = useState(false);

  const secondary = product.hoverImageUrl ?? null;

  return (
    <article
      className={cx(
        'group relative',
        // The dark-only card. `-translate-y-0.5` is the whole lift: enough to
        // register as a response, small enough that a 24-tile grid does not
        // ripple when the pointer crosses it.
        'dark:rounded-xl dark:border dark:border-line dark:bg-surface-card dark:p-1.5 dark:sm:p-2.5',
        'dark:transition-[transform,background-color,border-color,box-shadow] dark:duration-200 dark:ease-out',
        'dark:hover:-translate-y-0.5 dark:hover:border-line-strong dark:hover:bg-surface-hover dark:hover:shadow-lift',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="media-well aspect-[4/5] rounded dark:rounded-lg">
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
                // With an alternate shot the crossfade is the hover; without
                // one, a 1.03 push stands in for it.
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

        {discounted ? (
          <span
            data-numeric
            className="absolute left-2 top-2 rounded-xs bg-sale-brand px-1.5 py-0.5 text-2xs font-bold tracking-[0.02em] text-white"
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
            // Fixed white, not `ink-25`: this pill sits on the photograph, and
            // a themed surface turned it into a black dot on a pale shoe.
            'bg-white/85 shadow-xs ring-1 ring-inset ring-black/[0.06] backdrop-blur',
            'transition-[color,transform,background-color] duration-150',
            'hover:bg-white active:scale-95',
            'focus-visible:opacity-100 group-hover:opacity-100 lg:opacity-0',
            wishlist.contains(product.id)
              ? 'text-sale-brand lg:opacity-100'
              : 'text-scrim-700 hover:text-scrim-950',
          )}
        >
          <HeartIcon
            className={cx(
              'h-4 w-4',
              wishlist.contains(product.id) && 'animate-heart-pop fill-current',
            )}
          />
        </button>

        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-scrim-950/85 py-1.5 text-center text-2xs font-semibold uppercase tracking-[0.08em] text-white">
            <T id="ui.soldOut" />
          </span>
        ) : null}
      </div>

      <div className="pt-3 dark:px-0.5 dark:pb-0.5">
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

        {/* Price row. The reduced figure is the only thing here allowed to be
            loud; the original recedes to a struck, muted number and the saving
            is stated in words rather than shouted in a second badge. */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            data-numeric
            className={cx('price-now text-sm', discounted && 'price-now--reduced')}
          >
            {money(product.currentPriceMinor)}
          </span>
          {/* No percentage here — the badge on the image already states it, and
              saying it twice per tile is how a grid turns into a wall of red. */}
          {discounted ? (
            <span data-numeric className="price-was text-xs">
              {money(product.originalPriceMinor)}
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
      <p className="border-t border-line py-10 text-center lg:py-16 text-sm text-ink-500">
        <T id="ui.noProductsFound" />
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10">
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
      className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10"
      aria-hidden="true"
    >
      {/* Mirrors the dark card's border and padding as well as its rhythm, so
          the grid does not jump a few pixels when the real tiles land. */}
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="dark:rounded-xl dark:border dark:border-line dark:bg-surface-card dark:p-1.5 dark:sm:p-2.5"
        >
          <Skeleton className="aspect-[4/5] w-full dark:rounded-lg" />
          <Skeleton className="mt-3 h-2.5 w-16" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
