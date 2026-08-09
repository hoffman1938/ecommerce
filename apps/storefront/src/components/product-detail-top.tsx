'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProductDetailDto } from '@outlet/types';
import { StarRating, cx } from '@outlet/ui';
import { ProductGallery } from './product-gallery';
import { ProductPurchasePanel } from './product-purchase-panel';

/**
 * The buying half of a product page: imagery on the left, decision on the right.
 *
 * It exists as a client component purely to own one piece of state — the
 * selected colourway — because that single choice has to drive two independent
 * subtrees. Picking "Navy" has to swap the gallery as well as the size grid, and
 * a shopper who cannot see the colour they just chose does not trust the shop.
 */
export function ProductDetailTop({ product }: { product: ProductDetailDto }) {
  const colors = useMemo(
    () => [...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[],
    [product.variants],
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);

  /**
   * Images belong to a colourway through the variant they are attached to.
   * If nothing matches — an older catalogue with unattached imagery — showing
   * everything is far better than showing an empty stage.
   */
  const images = useMemo(() => {
    if (!selectedColor) return product.images;
    const idsForColor = new Set(
      product.variants.filter((v) => v.color === selectedColor).map((v) => v.id),
    );
    const matching = product.images.filter(
      (image) => image.variantId && idsForColor.has(image.variantId),
    );
    return matching.length > 0 ? matching : product.images;
  }, [product.images, product.variants, selectedColor]);

  const discounted = product.discountPercent > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-16">
      {/* The media column is capped rather than left to take the full 1fr: on a
          wide screen an uncapped 4:5 stage renders a product image taller than
          the viewport, which reads as a mistake rather than as generosity. */}
      <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:max-w-[42rem] lg:self-start">
        <ProductGallery
          images={images}
          productName={product.name}
          badge={
            discounted ? (
              <span
                data-numeric
                className="rounded-xs bg-sale-500 px-2 py-1 text-xs font-bold text-white shadow-sm"
              >
                −{product.discountPercent}%
              </span>
            ) : null
          }
        />
      </div>

      <div className="min-w-0">
        <Link
          href={`/brand/${product.brand.slug}`}
          className="eyebrow transition-colors hover:text-ink-950"
        >
          {product.brand.name}
        </Link>
        <h1 className="mt-2.5 text-2xl font-extrabold leading-[1.06] tracking-[-0.03em] text-ink-950 sm:text-3xl">
          {product.name}
        </h1>

        {/* Jumps to the reviews rather than repeating them — the rating here is
            a credibility signal, not the content. */}
        {product.ratingAverage !== null && product.reviewCount > 0 ? (
          <a href="#reviews" className="group mt-3 inline-flex items-center gap-2">
            <StarRating value={product.ratingAverage} size="md" />
            <span data-numeric className="text-sm text-ink-600 group-hover:text-ink-950">
              {product.ratingAverage.toFixed(1)}
            </span>
            <span
              data-numeric
              className={cx(
                'text-sm text-ink-500 underline underline-offset-2',
                'group-hover:text-ink-950',
              )}
            >
              ({product.reviewCount} {product.reviewCount === 1 ? 'review' : 'reviews'})
            </span>
          </a>
        ) : null}

        <div className="mt-6">
          <ProductPurchasePanel
            product={product}
            colors={colors}
            selectedColor={selectedColor}
            onSelectColor={setSelectedColor}
          />
        </div>
      </div>
    </div>
  );
}
