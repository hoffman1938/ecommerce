/**
 * Runtime catalogue overlay for the static demo build.
 *
 * The API-backed stack keeps categories and products in PostgreSQL and both
 * front ends read them over HTTP. The Cloudflare Pages export has no server, so
 * this module plays that role: a sparse set of deltas over the shipped
 * catalogue (./spec, ./taxonomy), persisted to localStorage.
 *
 * It lives in `@outlet/catalog` rather than inside either app on purpose. The
 * demo deploys the admin panel at `/admin` *inside* the storefront's export, so
 * the two share an origin and therefore share this storage key — which is what
 * makes "create a category in the admin, see it in the shop's navigation"
 * actually work without a backend. Two copies of this file would be two keys
 * and no propagation at all.
 *
 * Running the two dev servers separately (ports 3000 and 3001) is the one case
 * where propagation cannot happen: different origins, different storage.
 */

import type { ProductStatus, TargetGroup } from '@outlet/types';
import {
  CATEGORY_NODES,
  type CategoryLevel,
  type CategoryNodeSpec,
  type SizeChartGroup,
} from './taxonomy';
import { CATALOG_EPOCH, PRODUCTS, type ProductSpec } from './spec';

const STORAGE_KEY = 'outlet_catalog_overlay';
const STORAGE_VERSION = 1;

/** A category as the running shop sees it: the shipped shape plus its status. */
export interface CategoryRecord extends CategoryNodeSpec {
  /** False when an administrator has deliberately hidden it. */
  isActive: boolean;
  /** True for rows an administrator created, which may be deleted outright. */
  isCustom: boolean;
}

export type CategoryPatch = Partial<Omit<CategoryRecord, 'slug' | 'isCustom'>>;

/** A product as the running shop sees it: the shipped spec plus lifecycle. */
export interface CatalogProductSpec extends ProductSpec {
  status: ProductStatus;
  createdAt: string;
  isCustom: boolean;
}

export type ProductPatch = Partial<Omit<CatalogProductSpec, 'slug' | 'isCustom'>>;

interface CatalogOverlay {
  version: number;
  /** Categories an administrator created, in creation order. */
  createdCategories: CategoryRecord[];
  /** Sparse edits to shipped or created categories, keyed by slug. */
  categoryPatches: Record<string, CategoryPatch>;
  deletedCategorySlugs: string[];
  createdProducts: CatalogProductSpec[];
  productPatches: Record<string, ProductPatch>;
  deletedProductSlugs: string[];
}

function emptyOverlay(): CatalogOverlay {
  return {
    version: STORAGE_VERSION,
    createdCategories: [],
    categoryPatches: {},
    deletedCategorySlugs: [],
    createdProducts: [],
    productPatches: {},
    deletedProductSlugs: [],
  };
}

/**
 * The browser's storage, if there is one.
 *
 * Reached through `globalThis` rather than `window` so this package keeps
 * compiling without the DOM library — the API imports it for artwork, and a
 * Node service has no business acquiring `window` in its type environment.
 */
interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): WebStorage | null {
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

/**
 * The raw persisted string, doubling as a cheap change token.
 *
 * Every derivation below is memoised against it, so a page that reads the
 * category tree a dozen times per render pays for the expansion once, while an
 * edit made in the admin panel is picked up on the very next read.
 */
function rawState(): string {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function readOverlay(): CatalogOverlay {
  const raw = rawState();
  if (!raw) return emptyOverlay();
  try {
    const parsed = JSON.parse(raw) as CatalogOverlay;
    // A version bump discards rather than migrates: this is demo state, and a
    // half-migrated overlay is worse than a clean slate.
    if (parsed.version !== STORAGE_VERSION) return emptyOverlay();
    return { ...emptyOverlay(), ...parsed };
  } catch {
    return emptyOverlay();
  }
}

export function writeOverlay(mutate: (overlay: CatalogOverlay) => void): CatalogOverlay {
  const next = readOverlay();
  mutate(next);
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or private-mode failures must not break the UI.
  }
  return next;
}

export function resetOverlay(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to undo */
  }
}

// --- Memoised derivations ----------------------------------------------------

function memo<T>(compute: (overlay: CatalogOverlay) => T): () => T {
  let token: string | null = null;
  let value: T;
  return () => {
    const current = rawState();
    if (token !== current) {
      value = compute(readOverlay());
      token = current;
    }
    return value;
  };
}

const SHIPPED_CATEGORIES: CategoryRecord[] = CATEGORY_NODES.map((node) => ({
  ...node,
  isActive: true,
  isCustom: false,
}));

const SHIPPED_PRODUCTS: CatalogProductSpec[] = PRODUCTS.map((spec, index) => ({
  ...spec,
  status: 'ACTIVE',
  // Stagger createdAt so "newest" sorting is stable and meaningful.
  createdAt: new Date(Date.parse(CATALOG_EPOCH) + index * 3_600_000).toISOString(),
  isCustom: false,
}));

/** Every category the shop currently has, shipped and administrator-created. */
export const effectiveCategories = memo<CategoryRecord[]>((overlay) => {
  const deleted = new Set(overlay.deletedCategorySlugs);
  const merged = [...SHIPPED_CATEGORIES, ...overlay.createdCategories]
    .filter((category) => !deleted.has(category.slug))
    .map((category) => {
      const patch = overlay.categoryPatches[category.slug];
      return patch ? { ...category, ...patch } : category;
    });

  // Parent before child, then by the administrator's ordering. The tree
  // builders downstream rely on this, and so does the admin's flat listing.
  const depth = (category: CategoryRecord): number =>
    category.level === 'department' ? 0 : category.level === 'category' ? 1 : 2;
  return merged.sort(
    (a, b) => depth(a) - depth(b) || a.position - b.position || a.name.localeCompare(b.name),
  );
});

/** Every product the shop currently has, in every lifecycle state. */
export const effectiveProducts = memo<CatalogProductSpec[]>((overlay) => {
  const deleted = new Set(overlay.deletedProductSlugs);
  return [...SHIPPED_PRODUCTS, ...overlay.createdProducts]
    .filter((product) => !deleted.has(product.slug))
    .map((product) => {
      const patch = overlay.productPatches[product.slug];
      return patch ? { ...product, ...patch } : product;
    });
});

/**
 * Products a customer can actually buy.
 *
 * This is the definition category visibility is counted against: a draft,
 * disabled, archived or deleted product must not keep a category on the
 * storefront. Stock deliberately does not enter into it — a sold-out boot is
 * still a boot, and hiding "Boots" the moment the last pair sells would be a
 * worse shop, not a more honest one.
 */
export function availableProducts(): CatalogProductSpec[] {
  return effectiveProducts().filter((product) => product.status === 'ACTIVE');
}

// --- Category mutations ------------------------------------------------------

export function createCategoryRecord(input: {
  name: string;
  slug: string;
  pathSegment: string;
  parentSlug: string | null;
  targetGroup: TargetGroup;
  level: CategoryLevel;
  position?: number;
  isActive?: boolean;
  sizeChartGroup?: SizeChartGroup | null;
}): CategoryRecord {
  const siblings = effectiveCategories().filter((c) => c.parentSlug === input.parentSlug);
  const record: CategoryRecord = {
    name: input.name,
    slug: input.slug,
    pathSegment: input.pathSegment,
    parentSlug: input.parentSlug,
    targetGroup: input.targetGroup,
    level: input.level,
    position: input.position ?? siblings.length + 1,
    sizeChartGroup: input.sizeChartGroup ?? null,
    isActive: input.isActive ?? true,
    isCustom: true,
  };
  writeOverlay((overlay) => {
    // Re-creating something previously deleted resurrects it rather than
    // stacking a duplicate on top of the tombstone.
    overlay.deletedCategorySlugs = overlay.deletedCategorySlugs.filter((s) => s !== record.slug);
    overlay.createdCategories = [
      ...overlay.createdCategories.filter((c) => c.slug !== record.slug),
      record,
    ];
  });
  return record;
}

export function patchCategoryRecord(slug: string, patch: CategoryPatch): void {
  writeOverlay((overlay) => {
    const created = overlay.createdCategories.find((c) => c.slug === slug);
    if (created) {
      Object.assign(created, patch);
      return;
    }
    overlay.categoryPatches[slug] = { ...(overlay.categoryPatches[slug] ?? {}), ...patch };
  });
}

export function deleteCategoryRecord(slug: string): void {
  writeOverlay((overlay) => {
    overlay.createdCategories = overlay.createdCategories.filter((c) => c.slug !== slug);
    delete overlay.categoryPatches[slug];
    if (!overlay.deletedCategorySlugs.includes(slug)) overlay.deletedCategorySlugs.push(slug);
  });
}

// --- Product mutations -------------------------------------------------------

export function createProductRecord(spec: Omit<CatalogProductSpec, 'isCustom'>): void {
  writeOverlay((overlay) => {
    overlay.deletedProductSlugs = overlay.deletedProductSlugs.filter((s) => s !== spec.slug);
    overlay.createdProducts = [
      ...overlay.createdProducts.filter((p) => p.slug !== spec.slug),
      { ...spec, isCustom: true },
    ];
  });
}

export function patchProductRecord(slug: string, patch: ProductPatch): void {
  writeOverlay((overlay) => {
    const created = overlay.createdProducts.find((p) => p.slug === slug);
    if (created) {
      Object.assign(created, patch);
      return;
    }
    overlay.productPatches[slug] = { ...(overlay.productPatches[slug] ?? {}), ...patch };
  });
}

export function deleteProductRecord(slug: string): void {
  writeOverlay((overlay) => {
    overlay.createdProducts = overlay.createdProducts.filter((p) => p.slug !== slug);
    delete overlay.productPatches[slug];
    if (!overlay.deletedProductSlugs.includes(slug)) overlay.deletedProductSlugs.push(slug);
  });
}
