/**
 * Resolving a product to its size chart.
 *
 * The charts themselves are transcribed data (./size-guide-data). This module
 * is the only thing that decides *which* of them a given product should show,
 * and it answers `null` far more often than a size guide usually does — on
 * purpose. A shopper looking at a backpack, a wallet or a pair of unisex jeans
 * gets no guide at all, because the source data holds no chart for any of
 * those, and an empty or borrowed table is worse than no table.
 */

import type { TargetGroup } from '@outlet/types';
import { SIZE_CHARTS, SIZE_GUIDE_METADATA, type SizeChartData } from './size-guide-data';
import type { SizeChartGroup } from './taxonomy';

export { SIZE_CHARTS, SIZE_GUIDE_METADATA };
export type { SizeChartData, SizeChartRow } from './size-guide-data';

/**
 * Human names for the source's column keys.
 *
 * Names only — no value is derived, converted or rounded here. `US_UK` means
 * the source publishes one column covering both, and the label says so rather
 * than quietly splitting it into two.
 */
export const SIZE_COLUMN_LABELS: Record<string, string> = {
  international: 'International',
  unisex_size: 'Unisex',
  mens_size: "Men's",
  womens_size: "Women's",
  US: 'US',
  UK: 'UK',
  US_UK: 'US / UK',
  EU: 'EU',
  IT: 'IT',
  FR: 'FR',
  JP: 'JP',
  US_Men: 'US (men)',
  US_Women: 'US (women)',
  EU_Men: 'EU (men)',
  EU_Women: 'EU (women)',
  IT_Men: 'IT (men)',
  IT_Women: 'IT (women)',
  jeans_waist: 'Jeans waist',
  age: 'Age',
  height_cm: 'Height (cm)',
  chest_cm: 'Chest (cm)',
  chest_in: 'Chest (in)',
  bust_cm: 'Bust (cm)',
  bust_in: 'Bust (in)',
  waist_cm: 'Waist (cm)',
  waist_in: 'Waist (in)',
  collar_inches_US_UK: 'Collar (in, US/UK)',
  collar_cm_EU_IT_FR: 'Collar (cm, EU/IT/FR)',
};

export function sizeColumnLabel(key: string): string {
  return SIZE_COLUMN_LABELS[key] ?? key.replace(/_/g, ' ');
}

const CHART_BY_ID = new Map(SIZE_CHARTS.map((chart) => [chart.id, chart] as const));

export function sizeChartById(id: string): SizeChartData | null {
  return CHART_BY_ID.get(id) ?? null;
}

/** Every chart the source publishes for an audience, in source order. */
export function sizeChartsForAudience(audience: TargetGroup): SizeChartData[] {
  return SIZE_CHARTS.filter((chart) => chart.audience === audience);
}

/** Audiences the source has any chart for at all. */
export const SIZE_CHART_AUDIENCES: TargetGroup[] = [
  ...new Set(SIZE_CHARTS.map((chart) => chart.audience)),
];

/**
 * Product type × audience → chart id.
 *
 * Written out rather than inferred so that every gap is a deliberate one:
 *
 *  - Kids' sizing is published as a single `all_clothing` table covering every
 *    garment, so all three families point at it.
 *  - Unisex publishes one alpha matrix, for t-shirts and casual wear. There is
 *    no unisex shirt or trouser chart, so those resolve to nothing rather than
 *    borrowing the men's numbers — a unisex jean is waist-sized and the alpha
 *    matrix would be actively misleading.
 *  - Nothing maps footwear, bags or accessories anywhere: the source has no
 *    such data.
 */
const CHART_MATRIX: Record<SizeChartGroup, Partial<Record<TargetGroup, string>>> = {
  tops: {
    MEN: 'men.tshirts_and_casual',
    WOMEN: 'women.tshirts_and_casual',
    UNISEX: 'unisex.tshirts_and_casual',
    KIDS: 'kids.all_clothing',
  },
  shirts: {
    MEN: 'men.shirts',
    WOMEN: 'women.shirts_and_blouses',
    KIDS: 'kids.all_clothing',
  },
  bottoms: {
    MEN: 'men.jeans_and_trousers',
    WOMEN: 'women.jeans_and_trousers',
    KIDS: 'kids.all_clothing',
  },
};

/**
 * The chart a product page should open on, or `null` when the catalogue has no
 * sizing for that combination — in which case the guide is not rendered.
 */
export function resolveSizeChart(
  sizeChartGroup: SizeChartGroup | null | undefined,
  audience: TargetGroup,
): SizeChartData | null {
  if (!sizeChartGroup) return null;
  const id = CHART_MATRIX[sizeChartGroup]?.[audience];
  return id ? sizeChartById(id) : null;
}

/**
 * Whether the IT-versus-EU caveat in the source metadata applies to a chart.
 * It is a womenswear phenomenon, and the note only earns its space there.
 */
export function chartHasItEuNote(chart: SizeChartData): boolean {
  return chart.audience === 'WOMEN' && chart.columns.includes('IT') && chart.columns.includes('EU');
}
