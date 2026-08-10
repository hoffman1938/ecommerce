'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CloseIcon, ZoomInIcon, ZoomOutIcon, cx } from '@outlet/ui';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

export interface ViewerImage {
  id: string;
  url: string;
  altText: string | null;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Where a double-click or double-tap lands, when starting from fit. */
const DOUBLE_TAP_SCALE = 2.5;
/** Past this much horizontal travel an unzoomed drag counts as a swipe. */
const SWIPE_THRESHOLD = 56;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

/**
 * Full-screen product image viewer.
 *
 * Built around one invariant: `transform` is the single source of truth for
 * what is on screen, and every gesture — wheel, pinch, double-tap, drag, the
 * zoom buttons — is expressed as "keep this point under the pointer while the
 * scale changes". That is what makes wheel-zoom and pinch-zoom feel like the
 * same interaction rather than two implementations that drift apart.
 *
 * Panning is clamped to the scaled image's own bounds, so an image can never be
 * flung off into empty space and lost; at fit scale the offset is pinned to
 * zero and horizontal drags are reinterpreted as swipes between images.
 */
export function ImageViewer({
  images,
  startIndex,
  onClose,
  productName,
}: {
  images: ViewerImage[];
  startIndex: number;
  onClose: () => void;
  productName: string;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(startIndex);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);

  /** Natural size of the image currently on the stage, for fit maths. */
  const naturalRef = useRef({ width: 4, height: 5 });
  /** Live pointers, keyed by pointerId, so pinch and drag share one pipeline. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef({
    startDistance: 0,
    startScale: 1,
    lastX: 0,
    lastY: 0,
    swipeX: 0,
    swipeY: 0,
    isPinch: false,
  });
  const lastTapRef = useRef(0);

  const image = images[index];
  const zoomed = transform.scale > MIN_SCALE + 0.01;

  // --- Geometry ------------------------------------------------------------

  /**
   * The image's on-screen box at scale 1 — an object-contain fit inside the
   * stage. Panning bounds are derived from this rather than measured, because
   * measuring a transformed element gives back the transformed size.
   */
  const fitSize = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return { width: 0, height: 0, stageW: 0, stageH: 0 };
    const { width: stageW, height: stageH } = stage.getBoundingClientRect();
    const { width: nw, height: nh } = naturalRef.current;
    const ratio = Math.min(stageW / nw, stageH / nh);
    return { width: nw * ratio, height: nh * ratio, stageW, stageH };
  }, []);

  const clamp = useCallback(
    (next: Transform): Transform => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
      if (scale <= MIN_SCALE + 0.001) return { scale: MIN_SCALE, x: 0, y: 0 };
      const { width, height, stageW, stageH } = fitSize();
      const maxX = Math.max(0, (width * scale - stageW) / 2);
      const maxY = Math.max(0, (height * scale - stageH) / 2);
      return {
        scale,
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [fitSize],
  );

  /**
   * Rescale about a point given in client coordinates, holding whatever is
   * under that point in place. Every zoom entry point routes through here.
   */
  const zoomAbout = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const cx0 = clientX - rect.left - rect.width / 2;
      const cy0 = clientY - rect.top - rect.height / 2;
      setTransform((current) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        const factor = scale / current.scale;
        return clamp({
          scale,
          x: cx0 - factor * (cx0 - current.x),
          y: cy0 - factor * (cy0 - current.y),
        });
      });
    },
    [clamp],
  );

  /**
   * Zoom about the centre of the stage — what the toolbar buttons and the +/-
   * keys use. Routed through `zoomAbout` rather than just changing the scale:
   * after panning, holding the centre still means the offset has to scale with
   * it, and doing that by hand here is how the two paths drift apart.
   */
  const zoomBy = useCallback(
    (factor: number) => {
      setTransform((current) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
        const ratio = scale / current.scale;
        return clamp({ scale, x: current.x * ratio, y: current.y * ratio });
      });
    },
    [clamp],
  );

  const reset = useCallback(() => setTransform(IDENTITY), []);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = (current + delta + images.length) % images.length;
        return next;
      });
      setTransform(IDENTITY);
    },
    [images.length],
  );

  const select = useCallback((next: number) => {
    setIndex(next);
    setTransform(IDENTITY);
  }, []);

  // --- Lifecycle -----------------------------------------------------------

  // Lock the page behind the overlay and restore focus to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowRight':
          event.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          go(-1);
          break;
        case 'Home':
          event.preventDefault();
          select(0);
          break;
        case 'End':
          event.preventDefault();
          select(images.length - 1);
          break;
        case '+':
        case '=':
          event.preventDefault();
          zoomBy(1.4);
          break;
        case '-':
        case '_':
          event.preventDefault();
          zoomBy(1 / 1.4);
          break;
        case '0':
          event.preventDefault();
          reset();
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, images.length, onClose, reset, select, zoomBy]);

  // Keep focus inside the dialog while it is open.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        closeRef.current?.focus();
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // Keep the active thumbnail in view when paging with the keyboard.
  useLayoutEffect(() => {
    const rail = thumbRailRef.current;
    const active = rail?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [index]);

  /**
   * Wheel zoom. Registered natively rather than through React's synthetic
   * handler because React attaches wheel listeners passively, and a passive
   * listener cannot call preventDefault — without which the page behind the
   * overlay scrolls while zooming.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Trackpads report small deltas continuously; mice report ~100 per notch.
      const factor = Math.exp(-event.deltaY / 320);
      setTransform((current) => {
        const rect = stage.getBoundingClientRect();
        const cx0 = event.clientX - rect.left - rect.width / 2;
        const cy0 = event.clientY - rect.top - rect.height / 2;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
        const ratio = scale / current.scale;
        return clamp({
          scale,
          x: cx0 - ratio * (cx0 - current.x),
          y: cy0 - ratio * (cy0 - current.y),
        });
      });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [clamp]);

  // A resized window changes the fit box, so re-clamp rather than leave the
  // image parked outside its new bounds.
  useEffect(() => {
    const onResize = () => setTransform((current) => clamp(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  // --- Pointer gestures ----------------------------------------------------

  const distanceBetween = (points: { x: number; y: number }[]) =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

  const midpointOf = (points: { x: number; y: number }[]) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // The prev/next arrows live inside the stage. Capturing the pointer here
    // would retarget their click to the stage and they would stop working, so
    // gestures only ever start on the image itself.
    if ((event.target as HTMLElement).closest('button')) return;

    const pointers = pointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      // Capture keeps a drag alive when the pointer leaves the stage. It throws
      // if the pointer is already gone, which must not take the gesture with it.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the gesture still works without capture */
    }

    if (pointers.size === 2) {
      const points = [...pointers.values()];
      gestureRef.current.isPinch = true;
      gestureRef.current.startDistance = distanceBetween(points);
      gestureRef.current.startScale = transform.scale;
      return;
    }

    gestureRef.current.isPinch = false;
    gestureRef.current.lastX = event.clientX;
    gestureRef.current.lastY = event.clientY;
    gestureRef.current.swipeX = 0;
    gestureRef.current.swipeY = 0;
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Two fingers: pinch to zoom about the midpoint between them.
    if (pointers.size >= 2) {
      const points = [...pointers.values()].slice(0, 2);
      const distance = distanceBetween(points);
      if (gestureRef.current.startDistance > 0) {
        const midpoint = midpointOf(points);
        zoomAbout(
          gestureRef.current.startScale * (distance / gestureRef.current.startDistance),
          midpoint.x,
          midpoint.y,
        );
      }
      return;
    }

    const dx = event.clientX - gestureRef.current.lastX;
    const dy = event.clientY - gestureRef.current.lastY;
    gestureRef.current.lastX = event.clientX;
    gestureRef.current.lastY = event.clientY;
    gestureRef.current.swipeX += dx;
    gestureRef.current.swipeY += dy;

    // Zoomed in, a drag pans. At fit scale it is a swipe, resolved on release.
    if (zoomed) {
      setTransform((current) => clamp({ ...current, x: current.x + dx, y: current.y + dy }));
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      gestureRef.current.startDistance = 0;
      // Coming out of a pinch, the remaining finger must not jump the image.
      const remaining = [...pointers.values()][0];
      if (remaining) {
        gestureRef.current.lastX = remaining.x;
        gestureRef.current.lastY = remaining.y;
      }
    }
    if (pointers.size > 0) return;

    setDragging(false);
    const { swipeX, swipeY, isPinch } = gestureRef.current;

    if (!isPinch && !zoomed && images.length > 1) {
      if (Math.abs(swipeX) > SWIPE_THRESHOLD && Math.abs(swipeX) > Math.abs(swipeY)) {
        go(swipeX < 0 ? 1 : -1);
      }
    }
    gestureRef.current.isPinch = false;
  };

  /**
   * Double-click and double-tap both toggle between fit and a close-up centred
   * on what was tapped. Touch has no dblclick event, so taps are timed here.
   */
  const toggleZoomAt = (clientX: number, clientY: number) => {
    if (zoomed) reset();
    else zoomAbout(DOUBLE_TAP_SCALE, clientX, clientY);
  };

  const onPointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;
    const moved =
      Math.abs(gestureRef.current.swipeX) > 10 || Math.abs(gestureRef.current.swipeY) > 10;
    if (isDoubleTap && !moved && !gestureRef.current.isPinch) {
      toggleZoomAt(event.clientX, event.clientY);
    }
  };

  if (!image) return null;

  const label = image.altText ?? productName;

  /*
   * Portalled to <body> rather than rendered in place. In the tree the viewer
   * is a descendant of the product gallery, which sits below the sticky header
   * in stacking order — no z-index on the overlay can lift it out of an
   * ancestor's stacking context, so the header painted straight over it.
   */
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} — image ${index + 1} of ${images.length}`}
      // A literal near-black rather than an ink token: the viewer is a dark
      // room in both themes, so it must not invert with the palette.
      className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-[rgba(10,10,9,0.97)] backdrop-blur-sm"
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <p data-numeric className="text-sm tabular-nums text-white/70">
          {index + 1} <span className="text-white/35">/ {images.length}</span>
        </p>

        <div className="flex items-center gap-1">
          <ViewerButton
            label={t('ui.zoomOut')}
            onClick={() => zoomBy(1 / 1.4)}
            disabled={transform.scale <= MIN_SCALE + 0.01}
          >
            <ZoomOutIcon className="h-5 w-5" />
          </ViewerButton>
          <span
            data-numeric
            aria-live="polite"
            className="w-12 select-none text-center text-xs tabular-nums text-white/60"
          >
            {Math.round(transform.scale * 100)}%
          </span>
          <ViewerButton
            label={t('ui.zoom')}
            onClick={() => zoomBy(1.4)}
            disabled={transform.scale >= MAX_SCALE - 0.01}
          >
            <ZoomInIcon className="h-5 w-5" />
          </ViewerButton>
          <ViewerButton ref={closeRef} label={t('ui.closeImageViewer')} onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </ViewerButton>
        </div>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className={cx(
          'relative min-h-0 flex-1 touch-none select-none overflow-hidden',
          zoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerUpCapture={onPointerUpCapture}
        onDoubleClick={(event) => toggleZoomAt(event.clientX, event.clientY)}
      >
        <div
          className={cx(
            'absolute inset-0 flex items-center justify-center',
            // Only animate deliberate jumps; dragging must track the finger.
            dragging ? '' : 'transition-transform duration-200 ease-out',
          )}
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={image.id}
            src={image.url}
            alt={label}
            draggable={false}
            onLoad={(event) => {
              const target = event.currentTarget;
              naturalRef.current = {
                width: target.naturalWidth || 4,
                height: target.naturalHeight || 5,
              };
            }}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        {images.length > 1 ? (
          <>
            <StageArrow side="left" onClick={() => go(-1)} />
            <StageArrow side="right" onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {/* Caption + thumbnails */}
      <div className="shrink-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
        <p className="mb-2 truncate text-center text-xs text-white/55">{label}</p>
        {images.length > 1 ? (
          <div
            ref={thumbRailRef}
            className="scrollbar-none mx-auto flex max-w-full gap-2 overflow-x-auto px-1 sm:justify-center"
          >
            {images.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                data-active={itemIndex === index}
                onClick={() => select(itemIndex)}
                aria-label={`Show image ${itemIndex + 1}`}
                aria-current={itemIndex === index}
                className={cx(
                  'h-14 w-14 shrink-0 overflow-hidden rounded-xs bg-white/5 transition sm:h-16 sm:w-16',
                  itemIndex === index
                    ? 'ring-2 ring-white'
                    : 'opacity-55 ring-1 ring-white/15 hover:opacity-100',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-2 hidden text-center text-2xs text-white/35 lg:block"><T id="ui.scrollDoubleClickZoomDrag" /></p>
      </div>
    </div>,
    document.body,
  );
}

function StageArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      className={cx(
        'absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full',
        'bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

const ViewerButton = forwardRef<
  HTMLButtonElement,
  { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }
>(function ViewerButton({ label, onClick, disabled, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
});
