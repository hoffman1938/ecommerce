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
 * Mounted once in the root layout, which is exactly why it also watches the
 * DOM. The layout survives client-side navigation, so an effect that only ran
 * on mount would never see the `.reveal` sections belonging to pages visited
 * afterwards — and since the hidden state is CSS, those sections stayed at
 * `opacity: 0` for good. A MutationObserver keeps registration tied to
 * elements existing rather than to the router having just started.
 *
 * It watches *attributes* as well as child lists, and that is not belt and
 * braces. A section can acquire `.reveal` without ever being inserted: a
 * component that renders a placeholder while loading and the real thing
 * afterwards returns the same element type in the same position, so React
 * reconciles it by mutating `className` in place. No node is added, a
 * childList-only observer sees nothing, the element is never handed to the
 * IntersectionObserver, and it stays hidden for the life of the page. That is
 * precisely how "Picked for you" disappeared.
 *
 * Degrades safely — `.reveal` is only hidden under `html.js`, so without
 * scripting the rule never matches and content is never stranded invisible.
 */
export function useReveal(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    /**
     * Last resort: mark everything revealed and stop.
     *
     * The hidden state is CSS, so "no observer" must never mean "no content".
     * Returning early without this left every section at `opacity: 0` on any
     * browser without IntersectionObserver — the animation failing open is an
     * absent animation, failing closed is an empty page.
     */
    const revealAll = () => {
      for (const node of document.querySelectorAll('.reveal:not(.is-revealed)')) {
        node.classList.add('is-revealed');
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      revealAll();
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The CSS already neutralises the transform under reduced motion; adding
      // the class keeps the DOM honest about what has been shown.
      revealAll();
      return;
    }

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

    const track = (node: Element) => {
      if (node.classList.contains('reveal') && !node.classList.contains('is-revealed')) {
        // Observing the same element twice is a no-op, so this stays safe to
        // call from both the childList and the attribute path.
        observer.observe(node);
      }
    };

    const register = (root: ParentNode) => {
      for (const node of root.querySelectorAll('.reveal:not(.is-revealed)')) {
        observer.observe(node);
      }
    };

    register(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target instanceof Element) track(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          track(node);
          register(node);
        }
      }
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [enabled]);
}

/** Mount-anywhere version for pages that only need the side effect. */
export function Reveal() {
  useReveal();
  return null;
}
