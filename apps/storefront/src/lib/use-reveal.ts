'use client';

import { useEffect } from 'react';

/**
 * Progressive scroll-reveal.
 *
 * Elements marked `.reveal` fade and rise once when they first enter the
 * viewport. Deliberately one-shot and observer-based: re-animating on every
 * scroll direction change is the kind of motion that makes a page feel busy
 * rather than considered.
 *
 * Degrades safely — `.reveal` is visible by default under
 * prefers-reduced-motion, and if this never runs the CSS still resolves to the
 * hidden state only when the observer is available, so content is never
 * stranded invisible.
 */
export function useReveal(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(document.querySelectorAll('.reveal:not(.is-revealed)'));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      },
      // Trigger slightly before the element is fully on screen so the motion
      // finishes as the reader arrives, not after.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
}

/** Mount-anywhere version for pages that only need the side effect. */
export function Reveal() {
  useReveal();
  return null;
}
