'use client';

import { useState } from 'react';
import type { ProductImageDto } from '@outlet/types';
import { cx } from '@outlet/ui';

/**
 * Product imagery. A single image renders on its own; multiple images get a
 * thumbnail rail — vertical beside the stage on desktop, horizontal beneath it
 * on smaller screens where vertical space is scarcer than horizontal.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImageDto[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex] ?? images[0];

  const stage = (
    <div className="relative aspect-square overflow-hidden rounded bg-ink-50">
      {active ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={active.url}
          alt={active.altText ?? productName}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-ink-400">
          No image
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded ring-1 ring-inset ring-ink-950/[0.06]" />
    </div>
  );

  if (images.length <= 1) return stage;

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
      <ul className="flex gap-2 overflow-x-auto scrollbar-none sm:w-16 sm:shrink-0 sm:flex-col sm:overflow-visible">
        {images.map((image, index) => {
          const selected = index === activeIndex;
          return (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`View image ${index + 1} of ${images.length}`}
                aria-current={selected}
                className={cx(
                  'block h-16 w-16 overflow-hidden rounded bg-ink-50 transition-shadow',
                  selected
                    ? 'ring-2 ring-ink-950'
                    : 'ring-1 ring-inset ring-ink-950/10 hover:ring-ink-400',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="min-w-0 flex-1">{stage}</div>
    </div>
  );
}
