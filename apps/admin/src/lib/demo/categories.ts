'use client';

/**
 * Category management without a server.
 *
 * The rules here are the same ones AdminCategoriesService enforces against
 * PostgreSQL — three levels deep, no cycles, no two siblings sharing a URL
 * fragment, and no deletion that leaves a product without a category. They are
 * restated rather than shared because one side speaks Prisma and the other
 * speaks a localStorage overlay, but the *behaviour* an administrator sees has
 * to be identical: a demo that silently allows what the real panel rejects
 * teaches the wrong thing.
 */

import {
  createCategoryRecord,
  deleteCategoryRecord,
  effectiveCategories,
  effectiveProducts,
  patchCategoryRecord,
  patchProductRecord,
  type CategoryRecord,
} from '@outlet/catalog';
import type { CategoryLevel, SizeChartGroup, TargetGroup } from '@outlet/types';
import { currentCategoriesFlat, currentCategoryTree } from './data';

export class CategoryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CategoryError';
  }
}

const MAX_DEPTH = 3;

export interface CategoryInputBody {
  name?: unknown;
  slug?: unknown;
  pathSegment?: unknown;
  parentId?: unknown;
  targetGroup?: unknown;
  sizeChartGroup?: unknown;
  position?: unknown;
  isActive?: unknown;
}

function rows(): CategoryRecord[] {
  return effectiveCategories();
}

function find(slug: string): CategoryRecord {
  const row = rows().find((candidate) => candidate.slug === slug);
  if (!row) throw new CategoryError(404, 'Category not found');
  return row;
}

function childrenOf(slug: string | null): CategoryRecord[] {
  return rows().filter((row) => row.parentSlug === slug);
}

function descendantsOf(slug: string): CategoryRecord[] {
  const direct = childrenOf(slug);
  return direct.flatMap((child) => [child, ...descendantsOf(child.slug)]);
}

function depthBelow(slug: string): number {
  const direct = childrenOf(slug);
  return direct.length === 0 ? 0 : 1 + Math.max(...direct.map((child) => depthBelow(child.slug)));
}

/**
 * Where a new or moved row lands, and whether it may.
 *
 * A department states its own audience; everything below inherits the
 * department's, because a subcategory belonging to a different audience than
 * the department it hangs under is not something a shop can mean.
 */
function placement(
  parentSlug: string | null,
  requestedGroup?: TargetGroup,
): { parentSlug: string | null; level: CategoryLevel; targetGroup: TargetGroup } {
  if (!parentSlug) {
    return { parentSlug: null, level: 'department', targetGroup: requestedGroup ?? 'UNISEX' };
  }
  const parent = rows().find((row) => row.slug === parentSlug);
  if (!parent) throw new CategoryError(400, 'The parent category does not exist.');
  if (parent.level === 'subcategory') {
    throw new CategoryError(
      400,
      `Categories go ${MAX_DEPTH} levels deep: department, category, subcategory.`,
    );
  }
  return {
    parentSlug: parent.slug,
    level: parent.level === 'department' ? 'category' : 'subcategory',
    targetGroup: parent.targetGroup,
  };
}

function assertSegmentFree(parentSlug: string | null, pathSegment: string, exceptSlug?: string) {
  const clash = childrenOf(parentSlug).find(
    (row) => row.pathSegment === pathSegment && row.slug !== exceptSlug,
  );
  if (clash) {
    throw new CategoryError(
      409,
      `“${clash.name}” already uses the URL fragment “${pathSegment}” here.`,
    );
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CategoryError(400, `“${field}” is required.`);
  }
  return value.trim();
}

// --- Reads -------------------------------------------------------------------

export function listCategoryTree() {
  return currentCategoryTree();
}

// --- Writes ------------------------------------------------------------------

export function createCategory(body: CategoryInputBody) {
  const name = str(body.name, 'name');
  const parentSlug = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
  const spot = placement(parentSlug, body.targetGroup as TargetGroup | undefined);

  const segment = slugify(
    typeof body.pathSegment === 'string' && body.pathSegment ? body.pathSegment : name,
  );
  // Slugs are department-prefixed so the same garment type can exist under
  // several departments without colliding.
  const slug = slugify(
    typeof body.slug === 'string' && body.slug
      ? body.slug
      : spot.level === 'department'
        ? segment
        : `${spot.targetGroup.toLowerCase()}-${segment}`,
  );

  if (rows().some((row) => row.slug === slug)) {
    throw new CategoryError(409, `A category with the slug “${slug}” already exists.`);
  }
  assertSegmentFree(spot.parentSlug, segment);

  return createCategoryRecord({
    name,
    slug,
    pathSegment: segment,
    parentSlug: spot.parentSlug,
    targetGroup: spot.targetGroup,
    level: spot.level,
    position: typeof body.position === 'number' ? body.position : undefined,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    sizeChartGroup: (body.sizeChartGroup as SizeChartGroup | null) ?? null,
  });
}

export function updateCategory(slug: string, body: CategoryInputBody) {
  const existing = find(slug);
  const name = str(body.name, 'name');
  const segment = slugify(
    typeof body.pathSegment === 'string' && body.pathSegment ? body.pathSegment : name,
  );
  assertSegmentFree(existing.parentSlug, segment, slug);

  patchCategoryRecord(slug, {
    name,
    pathSegment: segment,
    sizeChartGroup: (body.sizeChartGroup as SizeChartGroup | null) ?? null,
    ...(typeof body.position === 'number' ? { position: body.position } : {}),
    ...(body.isActive === undefined ? {} : { isActive: Boolean(body.isActive) }),
  });
  return find(slug);
}

export function setCategoryVisibility(slug: string, isActive: boolean) {
  find(slug);
  patchCategoryRecord(slug, { isActive });
  return find(slug);
}

export function reorderCategories(parentSlug: string | null, orderedSlugs: string[]) {
  const known = new Set(childrenOf(parentSlug).map((row) => row.slug));
  if (orderedSlugs.some((candidate) => !known.has(candidate))) {
    throw new CategoryError(400, 'The order contains categories from a different parent.');
  }
  orderedSlugs.forEach((candidate, index) =>
    patchCategoryRecord(candidate, { position: index + 1 }),
  );
  return listCategoryTree();
}

/**
 * Re-parenting.
 *
 * The row must not end up inside its own subtree, and the branch must still fit
 * in three levels. The department follows the move — and so does the audience of
 * every product underneath, because a subcategory dragged from Men into Women
 * is womenswear now and would otherwise sit under the wrong navigation.
 */
export function moveCategory(slug: string, parentSlug: string | null, position?: number) {
  const node = find(slug);
  if (parentSlug === slug) throw new CategoryError(400, 'A category cannot be its own parent.');

  const descendants = descendantsOf(slug);
  if (parentSlug && descendants.some((child) => child.slug === parentSlug)) {
    throw new CategoryError(400, 'A category cannot be moved inside itself.');
  }

  const spot = placement(parentSlug);
  const levelDepth = { department: 1, category: 2, subcategory: 3 } as const;
  const depthAtTarget = levelDepth[spot.level] + depthBelow(slug);
  if (depthAtTarget > MAX_DEPTH) {
    throw new CategoryError(
      400,
      `That move would make the tree ${depthAtTarget} levels deep; the maximum is ${MAX_DEPTH}.`,
    );
  }
  assertSegmentFree(spot.parentSlug, node.pathSegment, slug);

  patchCategoryRecord(slug, {
    parentSlug: spot.parentSlug,
    level: spot.level,
    targetGroup: spot.targetGroup,
    position: position ?? childrenOf(spot.parentSlug).length + 1,
  });

  const movedSlugs = [slug, ...descendants.map((child) => child.slug)];
  for (const child of descendants) {
    patchCategoryRecord(child.slug, {
      targetGroup: spot.targetGroup,
      level: child.level === 'category' ? 'subcategory' : child.level,
    });
  }
  for (const product of effectiveProducts()) {
    if (movedSlugs.includes(product.category)) {
      patchProductRecord(product.slug, { targetGroup: spot.targetGroup });
    }
  }
  return listCategoryTree();
}

export interface CategoryDeleteBody {
  strategy?: unknown;
  targetCategoryId?: unknown;
  childStrategy?: unknown;
}

/**
 * Deleting without orphaning.
 *
 * The caller has to say where the products go: there is no default, because
 * "whatever happens by default" is how a shop finds out months later that forty
 * products have no category. Children are promoted to the deleted row's parent
 * unless the whole branch was explicitly asked for.
 */
export function deleteCategory(slug: string, body: CategoryDeleteBody) {
  const node = find(slug);
  const strategy = body.strategy === 'reassign' ? 'reassign' : 'detach';
  const childStrategy = body.childStrategy === 'cascade' ? 'cascade' : 'promote';

  const branch = childStrategy === 'cascade' ? [node, ...descendantsOf(slug)] : [node];
  const branchSlugs = branch.map((row) => row.slug);

  if (strategy === 'reassign') {
    const target = typeof body.targetCategoryId === 'string' ? body.targetCategoryId : '';
    if (!target) throw new CategoryError(400, 'Choose the category the products should move to.');
    if (branchSlugs.includes(target)) {
      throw new CategoryError(400, 'Products cannot be moved into a category being deleted.');
    }
    const destination = find(target);
    for (const product of effectiveProducts()) {
      if (branchSlugs.includes(product.category)) {
        patchProductRecord(product.slug, {
          category: destination.slug,
          targetGroup: destination.targetGroup,
        });
      }
    }
  } else {
    for (const product of effectiveProducts()) {
      if (branchSlugs.includes(product.category)) {
        patchProductRecord(product.slug, { category: '' });
      }
    }
  }

  if (childStrategy === 'promote') {
    for (const child of childrenOf(slug)) {
      patchCategoryRecord(child.slug, {
        parentSlug: node.parentSlug,
        level: node.level,
      });
    }
  }

  for (const row of branchSlugs) deleteCategoryRecord(row);
  return {
    message: `Deleted ${branchSlugs.length} categor${branchSlugs.length === 1 ? 'y' : 'ies'}.`,
  };
}

/**
 * The categories a product may be filed under: leaves first, since that is
 * where products belong, but a shop mid-reorganisation can still use a
 * level-two category directly.
 */
export function assignableCategories() {
  return currentCategoriesFlat().filter((node) => node.level !== 'department');
}
