/**
 * Turning category rows into the tree the shop navigates by.
 *
 * The rule that decides whether a shopper ever sees a category has to be
 * identical in three places — the PostgreSQL-backed API, the static demo build
 * and the admin panel's preview of both — so it is written once, here, over a
 * shape thin enough that a Prisma row and a localStorage record can each be
 * poured into it.
 *
 *   visible  =  the row is active
 *               AND every ancestor is active
 *               AND the row or something beneath it has an available product
 *
 * "Available" is the caller's business: it passes in the counts. What this
 * module guarantees is that a count of zero prunes the branch, that an
 * administrator's explicit hide beats any count, and that the two are reported
 * separately — `hidden` is a decision, `empty` is a fact, and conflating them
 * is what makes a category quietly never come back.
 */

import type { CategoryLevel, CategoryStatus, SizeChartGroup, TargetGroup } from '@outlet/types';

/** The minimum a category row must provide to be placed in the tree. */
export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  pathSegment: string;
  parentId: string | null;
  targetGroup: TargetGroup;
  level: CategoryLevel;
  position: number;
  isActive: boolean;
  sizeChartGroup: SizeChartGroup | null;
}

export type { CategoryStatus };

export interface CategoryTreeNode extends CategoryRow {
  /** Path segments from the department down to this row. */
  path: string[];
  /** `/shop/women/clothing/dresses`. */
  href: string;
  /** Products attached to this row itself. */
  directProductCount: number;
  /** Products on this row or anything beneath it. */
  productCount: number;
  status: CategoryStatus;
  /** True when a customer should be able to reach it. */
  isVisible: boolean;
  children: CategoryTreeNode[];
}

/** Products attached directly to a category, keyed by category id. */
export type DirectCounts = Record<string, number>;

export function categoryPathHref(path: string[]): string {
  return path.length > 0 ? `/shop/${path.join('/')}` : '/products';
}

/**
 * Builds the full tree, counts included. Nothing is pruned — the admin panel
 * needs the hidden and empty rows, and the storefront prunes with
 * `pruneToVisible` on the way out.
 */
export function buildCategoryTree(
  rows: CategoryRow[],
  directCounts: DirectCounts = {},
): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const row of rows) {
    byId.set(row.id, {
      ...row,
      path: [],
      href: '/products',
      directProductCount: directCounts[row.id] ?? 0,
      productCount: 0,
      status: 'active',
      isVisible: false,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    // A row whose parent has been deleted is orphaned rather than dropped: a
    // product still points at it, and silently losing it from the admin tree is
    // how categories become unreachable and unfixable.
    else roots.push(node);
  }

  const byPosition = (a: CategoryTreeNode, b: CategoryTreeNode) =>
    a.position - b.position || a.name.localeCompare(b.name);
  roots.sort(byPosition);

  const resolve = (node: CategoryTreeNode, parentPath: string[], ancestorsActive: boolean) => {
    node.path = [...parentPath, node.pathSegment];
    node.href = categoryPathHref(node.path);
    node.children.sort(byPosition);

    const branchActive = ancestorsActive && node.isActive;
    let total = node.directProductCount;
    for (const child of node.children) {
      resolve(child, node.path, branchActive);
      total += child.productCount;
    }
    node.productCount = total;
    node.status = !node.isActive ? 'hidden' : total === 0 ? 'empty' : 'active';
    node.isVisible = branchActive && total > 0;
  };

  for (const root of roots) resolve(root, [], true);
  return roots;
}

/** The customer-facing tree: hidden and empty branches removed. */
export function pruneToVisible(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes
    .filter((node) => node.isVisible)
    .map((node) => ({ ...node, children: pruneToVisible(node.children) }));
}

/** Depth-first walk over a built tree, parents before children. */
export function flattenTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/** A node and everything beneath it — what a category filter must match. */
export function subtreeIds(node: CategoryTreeNode): string[] {
  return flattenTree([node]).map((entry) => entry.id);
}

/**
 * Resolves `['women', 'clothing', 'dresses']` against a built tree.
 *
 * Returns the trail rather than just the leaf, because every caller that needs
 * the page also needs its breadcrumbs.
 */
export function resolvePath(nodes: CategoryTreeNode[], segments: string[]): CategoryTreeNode[] {
  const trail: CategoryTreeNode[] = [];
  let level = nodes;
  for (const segment of segments) {
    const match = level.find((node) => node.pathSegment === segment);
    if (!match) return [];
    trail.push(match);
    level = match.children;
  }
  return trail;
}
