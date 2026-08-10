'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductImageDto } from '@outlet/types';
import { ChevronLeft, ChevronRight, ExpandIcon, cx } from '@outlet/ui';
import { ImageViewer } from './image-viewer';

/**
 * Product imagery.
 *
 * Desktop gets a thumbnail rail beside a stage that magnifies under the cursor
 * — the interaction shoppers already expect from a fashion PDP, and the reason
 * they do not have to open anything to check a fabric. Small screens get a
 * swipeable, snap-scrolling pager with dots instead, because a hover zoom has
 * no meaning on touch and a vertical rail wastes the width.
 *
 * Both routes into the full-screen {@link ImageViewer}, which is where real
 * inspection happens: zoom, pan, keyboard and pinch.
 */
export function ProductGallery({
  images,
  productName,
  badge,
}: {
  images: ProductImageDto[];
  productName: string;
  /** Rendered over the top-left of the stage, e.g. a discount flag. */
  badge?: React.ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hoverZoom, setHoverZoom] = useState<{ x: number; y: number } | null>(null);
  const pagerRef = useRef<HTMLDivElement>(null);

  // A colour change swaps the image set; index must not point past the new end.
  useEffect(() => {
    setActiveIndex((current) => (current < images.length ? current : 0));
  }, [images.length]);

  const active = images[activeIndex] ?? images[0];

  const viewerImages = useMemo(
    () =>
      images.map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.altText,
      })),
    [images],
  );

  /** Keeps the mobile pager's dots in step with where it has been scrolled. */
  const onPagerScroll = () => {
    const pager = pagerRef.current;
    if (!pager) return;
    const next = Math.round(pager.scrollLeft / pager.clientWidth);
    setActiveIndex((current) => (current === next ? current : next));
  };

  const step = (delta: number) => {
    const next = (activeIndex + delta + images.length) % images.length;
    setActiveIndex(next);
    pagerRef.current?.scrollTo({ left: next * pagerRef.current.clientWidth, behavior: 'smooth' });
  };

  if (images.length === 0) {
    return (
      <div className="media-well flex aspect-[4/5] items-center justify-center rounded text-sm text-scrim-700 dark:rounded-lg">
        No image
      </div>
    );
  }

  return (
    <>
      {/* ---------- Mobile: swipeable pager ---------- */}
      <div className="lg:hidden">
        <div className="relative">
          <div
            ref={pagerRef}
            onScroll={onPagerScroll}
            className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded"
            aria-label={`${productName} images`}
          >
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  setViewerOpen(true);
                }}
                aria-label={`Open image ${index + 1} of ${images.length} full screen`}
                className="media-well relative aspect-[4/5] w-full shrink-0 snap-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.altText ?? productName}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>

          {badge ? <div className="pointer-events-none absolute left-3 top-3">{badge}</div> : null}

          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-scrim-950/55 text-white backdrop-blur">
            <ExpandIcon className="h-4 w-4" />
          </span>
        </div>

        {images.length > 1 ? (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => step(index - activeIndex)}
                aria-label={`Show image ${index + 1}`}
                aria-current={index === activeIndex}
                // The painted dot stays 6px; `before` extends the *hit* area to
                // a thumb-sized 24px without moving anything, so the pager is
                // tappable on a phone without opening up the visual spacing.
                className={cx(
                  'relative h-1.5 rounded-full transition-all duration-200',
                  'before:absolute before:-inset-y-2.5 before:-inset-x-1.5 before:content-[""]',
                  index === activeIndex ? 'w-5 bg-ink-950' : 'w-1.5 bg-ink-300 dark:bg-ink-400',
                )}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* ---------- Desktop: rail + magnifying stage ---------- */}
      <div className="hidden gap-4 lg:flex">
        {images.length > 1 ? (
          <ul className="flex w-[68px] shrink-0 flex-col gap-2">
            {images.map((image, index) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  aria-label={`View image ${index + 1} of ${images.length}`}
                  aria-current={index === activeIndex}
                  className={cx(
                    'media-well block aspect-[4/5] w-full rounded-xs transition duration-150',
                    // The thumbnails are light tiles in both themes, so the
                    // inactive ring stays dark rather than following the theme.
                    index === activeIndex
                      ? 'opacity-100 ring-2 ring-ink-950 dark:ring-ink-800'
                      : 'opacity-60 ring-1 ring-inset ring-black/10 hover:opacity-100 hover:ring-black/25 dark:opacity-50 dark:hover:opacity-100',
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
            ))}
          </ul>
        ) : null}

        {/* The group is the wrapper, not the stage button: the arrows are its
            siblings and still need to reveal on hover. */}
        <div className="group relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setHoverZoom({
                x: ((event.clientX - rect.left) / rect.width) * 100,
                y: ((event.clientY - rect.top) / rect.height) * 100,
              });
            }}
            onMouseLeave={() => setHoverZoom(null)}
            aria-label="Open image full screen"
            className="media-well block aspect-[4/5] w-full cursor-zoom-in rounded dark:rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.altText ?? productName}
              className={cx(
                'h-full w-full object-cover transition-transform duration-200 ease-out',
                hoverZoom ? 'scale-[2]' : 'scale-100',
              )}
              style={hoverZoom ? { transformOrigin: `${hoverZoom.x}% ${hoverZoom.y}%` } : undefined}
            />

            <span className="pointer-events-none absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-scrim-950/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <ExpandIcon className="h-4 w-4" />
            </span>
          </button>

          {badge ? <div className="pointer-events-none absolute left-3 top-3">{badge}</div> : null}

          {images.length > 1 ? (
            <>
              <GalleryArrow
                side="left"
                onClick={() => setActiveIndex((i) => (i - 1 + images.length) % images.length)}
              />
              <GalleryArrow
                side="right"
                onClick={() => setActiveIndex((i) => (i + 1) % images.length)}
              />
            </>
          ) : null}
        </div>
      </div>

      {viewerOpen ? (
        <ImageViewer
          images={viewerImages}
          startIndex={activeIndex}
          productName={productName}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </>
  );
}

function GalleryArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      className={cx(
        'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full',
        // On the photograph, so fixed white with dark glyphs in both themes.
        'bg-white/85 text-scrim-800 opacity-0 shadow-sm ring-1 ring-inset ring-black/[0.06] backdrop-blur',
        'transition duration-150 hover:bg-white hover:text-scrim-950',
        'focus-visible:opacity-100 group-hover:opacity-100',
        // The arrows belong to the stage, which is the hover group.
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
