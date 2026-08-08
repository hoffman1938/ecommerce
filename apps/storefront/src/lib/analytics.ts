'use client';

/**
 * Provider-agnostic commerce event tracking.
 *
 * Call sites emit typed domain events; where those events *go* is decided in
 * one place here. The default sink is a no-op, so the storefront ships with no
 * third-party script, no cookie and no network call — wiring GA4, Plausible or
 * a warehouse later means registering a sink, not editing components.
 *
 * Deliberately not collected: anything identifying a person. Events carry
 * product ids, prices and counts, never names, emails or addresses. The demo
 * build keeps a short in-memory ring buffer instead, which is what the QA
 * console reads.
 */

export interface AnalyticsEvents {
  product_view: { productId: string; slug: string; brand: string; priceMinor: number };
  search: { term: string; resultCount: number };
  filter_used: { filter: string; value: string };
  add_to_cart: {
    productId: string;
    variantId: string;
    quantity: number;
    priceMinor: number;
  };
  remove_from_cart: { productId: string; variantId: string; quantity: number };
  save_for_later: { productId: string; variantId: string };
  wishlist_add: { productId: string };
  wishlist_remove: { productId: string };
  promo_applied: { code: string; discountMinor: number };
  promo_rejected: { code: string; reason: string };
  checkout_started: { itemCount: number; totalMinor: number };
  checkout_step: { step: 'information' | 'delivery' | 'payment' | 'review' };
  checkout_completed: { orderNumber: string; totalMinor: number };
  payment_failed: { reason: string };
  purchase: {
    orderNumber: string;
    totalMinor: number;
    currency: string;
    itemCount: number;
  };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

export interface AnalyticsEvent<K extends AnalyticsEventName = AnalyticsEventName> {
  name: K;
  payload: AnalyticsEvents[K];
  at: string;
}

type Sink = (event: AnalyticsEvent) => void;

const sinks: Sink[] = [];

/** Most recent events, newest last. Bounded so it cannot grow unbounded. */
const RECENT_LIMIT = 100;
const recent: AnalyticsEvent[] = [];

/**
 * Register a destination for events. Returns an unsubscribe function.
 *
 * A sink that throws must not break the interaction that emitted the event, so
 * failures are swallowed with a console warning.
 */
export function registerAnalyticsSink(sink: Sink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index >= 0) sinks.splice(index, 1);
  };
}

export function track<K extends AnalyticsEventName>(name: K, payload: AnalyticsEvents[K]): void {
  const event: AnalyticsEvent = {
    name,
    payload,
    at: new Date().toISOString(),
  } as AnalyticsEvent;

  recent.push(event);
  if (recent.length > RECENT_LIMIT) recent.shift();

  for (const sink of sinks) {
    try {
      sink(event);
    } catch (error) {
      // Analytics must never take down the page it is measuring.
      console.warn('[analytics] sink failed', error);
    }
  }
}

/** Snapshot of the in-memory buffer, oldest first. */
export function recentAnalyticsEvents(): AnalyticsEvent[] {
  return [...recent];
}

export function clearAnalyticsEvents(): void {
  recent.length = 0;
}
