/**
 * The shop's category taxonomy, as data.
 *
 * Three levels, because that is how clothing is actually shopped:
 *
 *   department    Men · Women · Kids · Unisex     — who it is for
 *   category      Clothing · Shoes · Accessories  — what kind of thing it is
 *   subcategory   T-Shirts · Sneakers · Belts     — the garment type
 *
 * A department is a real row rather than a filter so that "Women → Shoes →
 * Heels" and "Men → Shoes → Boots" can be ordered, renamed, hidden and counted
 * independently — the whole point of the admin's category screen. Every row
 * carries the `targetGroup` of its department, which keeps the existing
 * audience filter (`?targetGroup=WOMEN`) and the tree in agreement without a
 * join.
 *
 * `slug` is globally unique and is what products, filters and `/category/:slug`
 * reference. `pathSegment` is the URL fragment within a parent, which is what
 * makes `/shop/women/clothing/dresses` readable without inventing a second
 * identifier.
 *
 * This file defines the *shipped* taxonomy. Administrators add to it, rename
 * it and hide parts of it at runtime; nothing downstream reads these constants
 * directly except the seed and the static demo build.
 */

import type { CategoryLevel, SizeChartGroup, TargetGroup } from '@outlet/types';

export type { CategoryLevel, SizeChartGroup };

export interface CategoryNodeSpec {
  slug: string;
  name: string;
  /** URL fragment within the parent, e.g. `dresses` in `/shop/women/clothing/dresses`. */
  pathSegment: string;
  parentSlug: string | null;
  targetGroup: TargetGroup;
  level: CategoryLevel;
  position: number;
  sizeChartGroup: SizeChartGroup | null;
}

// --- Declaration -------------------------------------------------------------

interface SubcategorySeed {
  segment: string;
  name: string;
  sizeChartGroup?: SizeChartGroup;
}

interface CategorySeed {
  segment: string;
  name: string;
  children: SubcategorySeed[];
}

interface DepartmentSeed {
  segment: string;
  name: string;
  targetGroup: TargetGroup;
  children: CategorySeed[];
}

/**
 * Garment types shared by the adult departments, declared once so Men's and
 * Women's clothing cannot drift apart in naming or in which chart they use.
 */
const TOP: SizeChartGroup = 'tops';
const SHIRT: SizeChartGroup = 'shirts';
const BOTTOM: SizeChartGroup = 'bottoms';

const DEPARTMENT_SEEDS: DepartmentSeed[] = [
  {
    segment: 'men',
    name: 'Men',
    targetGroup: 'MEN',
    children: [
      {
        segment: 'clothing',
        name: 'Clothing',
        children: [
          { segment: 't-shirts', name: 'T-Shirts', sizeChartGroup: TOP },
          { segment: 'polos', name: 'Polos', sizeChartGroup: TOP },
          { segment: 'shirts', name: 'Shirts', sizeChartGroup: SHIRT },
          { segment: 'hoodies', name: 'Hoodies', sizeChartGroup: TOP },
          { segment: 'sweaters', name: 'Sweaters', sizeChartGroup: TOP },
          { segment: 'jackets', name: 'Jackets', sizeChartGroup: TOP },
          { segment: 'coats', name: 'Coats', sizeChartGroup: TOP },
          { segment: 'jeans', name: 'Jeans', sizeChartGroup: BOTTOM },
          { segment: 'trousers', name: 'Trousers', sizeChartGroup: BOTTOM },
          { segment: 'shorts', name: 'Shorts', sizeChartGroup: BOTTOM },
        ],
      },
      {
        segment: 'shoes',
        name: 'Shoes',
        children: [
          { segment: 'sneakers', name: 'Sneakers' },
          { segment: 'boots', name: 'Boots' },
          { segment: 'loafers', name: 'Loafers' },
          { segment: 'formal-shoes', name: 'Formal Shoes' },
        ],
      },
      {
        segment: 'accessories',
        name: 'Accessories',
        children: [
          { segment: 'bags', name: 'Bags' },
          { segment: 'belts', name: 'Belts' },
          { segment: 'wallets', name: 'Wallets' },
          { segment: 'hats', name: 'Hats' },
        ],
      },
    ],
  },
  {
    segment: 'women',
    name: 'Women',
    targetGroup: 'WOMEN',
    children: [
      {
        segment: 'clothing',
        name: 'Clothing',
        children: [
          { segment: 'dresses', name: 'Dresses', sizeChartGroup: TOP },
          { segment: 'tops', name: 'Tops', sizeChartGroup: TOP },
          { segment: 't-shirts', name: 'T-Shirts', sizeChartGroup: TOP },
          { segment: 'shirts', name: 'Shirts', sizeChartGroup: SHIRT },
          { segment: 'hoodies', name: 'Hoodies', sizeChartGroup: TOP },
          { segment: 'sweaters', name: 'Sweaters', sizeChartGroup: TOP },
          { segment: 'jackets', name: 'Jackets', sizeChartGroup: TOP },
          { segment: 'coats', name: 'Coats', sizeChartGroup: TOP },
          { segment: 'jeans', name: 'Jeans', sizeChartGroup: BOTTOM },
          { segment: 'trousers', name: 'Trousers', sizeChartGroup: BOTTOM },
          { segment: 'skirts', name: 'Skirts', sizeChartGroup: BOTTOM },
        ],
      },
      {
        segment: 'shoes',
        name: 'Shoes',
        children: [
          { segment: 'sneakers', name: 'Sneakers' },
          { segment: 'boots', name: 'Boots' },
          { segment: 'heels', name: 'Heels' },
          { segment: 'flats', name: 'Flats' },
          { segment: 'sandals', name: 'Sandals' },
        ],
      },
      {
        segment: 'accessories',
        name: 'Accessories',
        children: [
          { segment: 'bags', name: 'Bags' },
          { segment: 'belts', name: 'Belts' },
          { segment: 'wallets', name: 'Wallets' },
          { segment: 'hats', name: 'Hats' },
          { segment: 'sunglasses', name: 'Sunglasses' },
        ],
      },
    ],
  },
  {
    segment: 'kids',
    name: 'Kids',
    targetGroup: 'KIDS',
    children: [
      {
        segment: 'clothing',
        name: 'Clothing',
        children: [
          { segment: 't-shirts', name: 'T-Shirts', sizeChartGroup: TOP },
          { segment: 'hoodies', name: 'Hoodies', sizeChartGroup: TOP },
          { segment: 'jackets', name: 'Jackets', sizeChartGroup: TOP },
          { segment: 'dresses', name: 'Dresses', sizeChartGroup: TOP },
          { segment: 'jeans', name: 'Jeans', sizeChartGroup: BOTTOM },
          { segment: 'trousers', name: 'Trousers', sizeChartGroup: BOTTOM },
        ],
      },
      {
        segment: 'shoes',
        name: 'Shoes',
        children: [
          { segment: 'sneakers', name: 'Sneakers' },
          { segment: 'boots', name: 'Boots' },
          { segment: 'sandals', name: 'Sandals' },
        ],
      },
      {
        segment: 'accessories',
        name: 'Accessories',
        children: [
          { segment: 'backpacks', name: 'Backpacks' },
          { segment: 'hats', name: 'Hats' },
        ],
      },
    ],
  },
  {
    segment: 'unisex',
    name: 'Unisex',
    targetGroup: 'UNISEX',
    children: [
      {
        segment: 'clothing',
        name: 'Clothing',
        children: [
          { segment: 't-shirts', name: 'T-Shirts', sizeChartGroup: TOP },
          { segment: 'hoodies', name: 'Hoodies', sizeChartGroup: TOP },
          { segment: 'jackets', name: 'Jackets', sizeChartGroup: TOP },
          { segment: 'trousers', name: 'Trousers', sizeChartGroup: BOTTOM },
        ],
      },
      {
        segment: 'shoes',
        name: 'Shoes',
        children: [
          { segment: 'sneakers', name: 'Sneakers' },
          { segment: 'running-shoes', name: 'Running Shoes' },
          { segment: 'boots', name: 'Boots' },
        ],
      },
      {
        segment: 'accessories',
        name: 'Accessories',
        children: [
          { segment: 'backpacks', name: 'Backpacks' },
          { segment: 'bags', name: 'Bags' },
          { segment: 'hats', name: 'Hats' },
          { segment: 'wallets', name: 'Wallets' },
          { segment: 'scarves', name: 'Scarves' },
          { segment: 'socks', name: 'Socks' },
        ],
      },
    ],
  },
];

/**
 * Slugs are prefixed with the department because they are globally unique and
 * the same garment type exists under several departments — a bare `t-shirts`
 * could not say whose.
 */
function slugFor(departmentSegment: string, segment: string): string {
  return `${departmentSegment}-${segment}`;
}

function flatten(): CategoryNodeSpec[] {
  const nodes: CategoryNodeSpec[] = [];
  DEPARTMENT_SEEDS.forEach((department, departmentIndex) => {
    nodes.push({
      slug: department.segment,
      name: department.name,
      pathSegment: department.segment,
      parentSlug: null,
      targetGroup: department.targetGroup,
      level: 'department',
      position: departmentIndex + 1,
      sizeChartGroup: null,
    });

    department.children.forEach((category, categoryIndex) => {
      const categorySlug = slugFor(department.segment, category.segment);
      nodes.push({
        slug: categorySlug,
        name: category.name,
        pathSegment: category.segment,
        parentSlug: department.segment,
        targetGroup: department.targetGroup,
        level: 'category',
        position: categoryIndex + 1,
        sizeChartGroup: null,
      });

      category.children.forEach((child, childIndex) => {
        nodes.push({
          slug: slugFor(department.segment, child.segment),
          name: child.name,
          pathSegment: child.segment,
          parentSlug: categorySlug,
          targetGroup: department.targetGroup,
          level: 'subcategory',
          position: childIndex + 1,
          sizeChartGroup: child.sizeChartGroup ?? null,
        });
      });
    });
  });
  return nodes;
}

/** Every category row, parents before children, in display order. */
export const CATEGORY_NODES: CategoryNodeSpec[] = flatten();

const NODE_BY_SLUG = new Map(CATEGORY_NODES.map((node) => [node.slug, node] as const));

export function categoryNode(slug: string): CategoryNodeSpec | undefined {
  return NODE_BY_SLUG.get(slug);
}

/** The department a row belongs to, or the row itself when it is one. */
export function departmentOf(slug: string): CategoryNodeSpec | undefined {
  const node = NODE_BY_SLUG.get(slug);
  if (!node) return undefined;
  return CATEGORY_NODES.find(
    (candidate) => candidate.level === 'department' && candidate.targetGroup === node.targetGroup,
  );
}

/** Root-to-node trail, used for breadcrumbs and for building URLs. */
export function categoryTrail(slug: string): CategoryNodeSpec[] {
  const trail: CategoryNodeSpec[] = [];
  let current = NODE_BY_SLUG.get(slug);
  while (current) {
    trail.unshift(current);
    current = current.parentSlug ? NODE_BY_SLUG.get(current.parentSlug) : undefined;
  }
  return trail;
}

/** `/shop/women/clothing/dresses` for any row, department included. */
export function categoryHref(slug: string): string {
  const segments = categoryTrail(slug).map((node) => node.pathSegment);
  return segments.length > 0 ? `/shop/${segments.join('/')}` : '/products';
}

/**
 * The size chart family for a subcategory, looked up through its ancestors.
 *
 * Products are attached to leaves, but a shop that has not finished
 * sub-categorising can attach one to `men-clothing` directly, and the guide
 * should still know it is clothing rather than silently vanish.
 */
export function sizeChartGroupFor(slug: string | null | undefined): SizeChartGroup | null {
  if (!slug) return null;
  const node = NODE_BY_SLUG.get(slug);
  return node?.sizeChartGroup ?? null;
}
