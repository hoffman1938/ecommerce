'use client';

/**
 * Mutable demo state, persisted to localStorage.
 *
 * The generated dataset in ./data is immutable and identical for everyone. This
 * layer holds the deltas an admin creates while clicking around — moderated
 * reviews, disabled customers, edited products — so changes survive a reload
 * without ever leaving the browser.
 *
 * Scope is deliberately per-visitor. There is no server, so "shared state" is
 * not on offer; the banner in the panel says so.
 */

import { DEMO_CUSTOMERS, DEMO_PRODUCTS, DEMO_REVIEWS, type DemoReview } from './data';

const STORE_KEY = 'outlet_admin_demo_state';
const STORE_VERSION = 1;

export interface DemoAdminSession {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}

interface DemoAdminState {
  version: number;
  session: DemoAdminSession | null;
  /** Sparse overlays, keyed by entity id — absent means "unchanged". */
  reviews: Record<string, Partial<DemoReview>>;
  customers: Record<string, { status?: 'ACTIVE' | 'DISABLED'; disabledReason?: string | null }>;
  products: Record<string, Record<string, unknown>>;
  deletedReviewIds: string[];
  auditLog: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actorEmail: string;
    createdAt: string;
  }>;
}

function emptyState(): DemoAdminState {
  return {
    version: STORE_VERSION,
    session: null,
    reviews: {},
    customers: {},
    products: {},
    deletedReviewIds: [],
    auditLog: [],
  };
}

let cache: DemoAdminState | null = null;

export function readState(): DemoAdminState {
  if (cache) return cache;
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) {
      cache = emptyState();
      return cache;
    }
    const parsed = JSON.parse(raw) as DemoAdminState;
    // A version bump discards rather than migrates: this is demo state, and a
    // half-migrated overlay is worse than a clean slate.
    cache = parsed.version === STORE_VERSION ? { ...emptyState(), ...parsed } : emptyState();
    return cache;
  } catch {
    cache = emptyState();
    return cache;
  }
}

export function writeState(mutate: (state: DemoAdminState) => void): DemoAdminState {
  const state = readState();
  mutate(state);
  cache = state;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Quota or private-mode failures must not break the UI; the change still
      // applies to the in-memory cache for this session.
    }
  }
  return state;
}

export function resetState(): void {
  cache = emptyState();
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORE_KEY);
}

export function recordAudit(
  action: string,
  entityType: string,
  entityId: string | null,
): void {
  writeState((state) => {
    state.auditLog.unshift({
      id: `audit_${Date.now()}_${state.auditLog.length}`,
      action,
      entityType,
      entityId,
      actorEmail: state.session?.email ?? 'demo@local',
      createdAt: new Date().toISOString(),
    });
    // Unbounded growth would eventually blow the localStorage quota.
    state.auditLog = state.auditLog.slice(0, 200);
  });
}

// --- Projections -----------------------------------------------------------

/** Base data with this browser's overlays applied. */
export function currentReviews(): DemoReview[] {
  const state = readState();
  return DEMO_REVIEWS.filter((review) => !state.deletedReviewIds.includes(review.id)).map(
    (review) => ({ ...review, ...(state.reviews[review.id] ?? {}) }),
  );
}

export function currentCustomers() {
  const state = readState();
  return DEMO_CUSTOMERS.map((customer) => ({ ...customer, ...(state.customers[customer.id] ?? {}) }));
}

export function currentProducts() {
  const state = readState();
  return DEMO_PRODUCTS.map((product) => ({ ...product, ...(state.products[product.id] ?? {}) }));
}

/**
 * Product rating aggregates recomputed from the *overlaid* reviews.
 *
 * The real API keeps `ratingSum`/`reviewCount` denormalised on the product row
 * and recomputes them on every moderation write. Mirroring that here is what
 * makes moderating a review in the demo actually move the product's average,
 * instead of leaving the two screens disagreeing.
 */
export function ratingFor(productId: string): { ratingSum: number; reviewCount: number } {
  const published = currentReviews().filter(
    (review) => review.product.id === productId && review.status === 'PUBLISHED',
  );
  return {
    ratingSum: published.reduce((sum, review) => sum + review.rating, 0),
    reviewCount: published.length,
  };
}
