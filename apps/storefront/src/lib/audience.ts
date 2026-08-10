import type { TargetGroup } from '@outlet/types';

/**
 * The four audiences the shop is browsed by.
 *
 * `targetGroup` already existed on every product and in the filter panel, but
 * only as a facet — something you could narrow by once you were already in a
 * listing. These give it a front door: a slug that routes, a translation key so
 * the label is never hardcoded English, and one ordering used by the header,
 * the mobile drawer and the audience pages alike.
 */
export interface Audience {
  slug: string;
  group: TargetGroup;
  /** Key under `audience.*` in the locale files. */
  key: string;
}

export const AUDIENCES: Audience[] = [
  { slug: 'men', group: 'MEN', key: 'men' },
  { slug: 'women', group: 'WOMEN', key: 'women' },
  { slug: 'kids', group: 'KIDS', key: 'kids' },
  { slug: 'unisex', group: 'UNISEX', key: 'unisex' },
];

export function audienceBySlug(slug: string): Audience | undefined {
  return AUDIENCES.find((a) => a.slug === slug);
}

export function audienceByGroup(group: TargetGroup): Audience | undefined {
  return AUDIENCES.find((a) => a.group === group);
}
