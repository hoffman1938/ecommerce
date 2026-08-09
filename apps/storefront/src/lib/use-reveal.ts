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
 * Degrades safely — `.reveal` is only hidden under `html.js`, so without
 * scripting the rule never matches and content is never stranded invisible.
 */
export function useReveal(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

    const register = (root: ParentNode) => {
      for (const node of root.querySelectorAll('.reveal:not(.is-revealed)')) {
        observer.observe(node);
      }
    };

    register(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.classList.contains('reveal')) observer.observe(node);
          register(node);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

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
