'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CategoryDto, TargetGroup } from '@outlet/types';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * The storefront's view of the category tree.
 *
 * One query, one cache key, shared by the header, the mobile drawer, the
 * category pages and the empty-state suggestions — so every part of the shop is
 * looking at the same navigation, and none of them decides for itself what is
 * visible. `/catalog/categories` has already removed anything hidden or empty;
 * nothing here re-implements that rule.
 */
export function useCategoryTree() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryDto[]>('/catalog/categories'),
    // Navigation changes when an administrator changes it, not per page view.
    staleTime: 60_000,
  });
}

/** Depth-first, parents before children. */
export function flattenCategories(nodes: CategoryDto[] = []): CategoryDto[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children)]);
}

export function departmentFor(
  nodes: CategoryDto[] = [],
  group: TargetGroup,
): CategoryDto | undefined {
  return nodes.find((node) => node.level === 'department' && node.targetGroup === group);
}

export function categoryBySlug(nodes: CategoryDto[] = [], slug: string): CategoryDto | undefined {
  return flattenCategories(nodes).find((node) => node.slug === slug);
}

/**
 * Popular places to send someone who has hit an empty result.
 *
 * Ranked by how much is actually in them, and drawn from the live tree rather
 * than a hardcoded list — offering a shortcut to a category the shop no longer
 * stocks is a worse dead end than the one the shopper is already in.
 */
export function suggestedCategories(nodes: CategoryDto[] = [], limit = 7): CategoryDto[] {
  return flattenCategories(nodes)
    .filter((node) => node.level === 'subcategory' && node.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * A category's display name in the reader's language.
 *
 * Names arrive from the catalogue as English data, and translating them by
 * looking up the URL fragment means the header, the tiles and the category
 * pages all resolve through one vocabulary. A fragment with no key yet — which
 * every category an administrator invents will be — falls back to the name they
 * typed, which is the only honest answer: the shop has no translation for it.
 */
export function useCategoryLabel(): (node: CategoryDto) => string {
  const { t } = useI18n();
  return useCallback(
    (node: CategoryDto) => {
      const key =
        node.level === 'department'
          ? `audience.${node.targetGroup.toLowerCase()}`
          : `categories.${camelCase(node.pathSegment)}`;
      const translated = t(key);
      return translated === key ? node.name : translated;
    },
    [t],
  );
}

function camelCase(segment: string): string {
  return segment.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/**
 * A label that survives leaving its department behind.
 *
 * "Boots" alone is ambiguous once it is out of the tree — there are four of
 * them — so anywhere a category is listed flat, the department comes with it.
 */
export function qualifiedName(nodes: CategoryDto[] = [], node: CategoryDto): string {
  if (node.level === 'department') return node.name;
  const department = departmentFor(nodes, node.targetGroup);
  return department ? `${department.name} · ${node.name}` : node.name;
}
