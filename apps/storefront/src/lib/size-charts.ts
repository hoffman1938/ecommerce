import type { TargetGroup } from '@outlet/types';

/**
 * Size conversion tables.
 *
 * Data, not presentation, so the guide component stays a rendering concern and
 * the numbers can be checked in one place. Values follow the conventional
 * European retail conversions: EU is the primary scale the catalogue is sold
 * in, UK and US are the two systems customers most often convert *from*, and a
 * body or foot measurement in centimetres is the tie-breaker when the letter
 * systems disagree — which, between UK and US womenswear, they routinely do.
 *
 * Sizes themselves are never translated. "M", "42" and "10Y" are codes printed
 * on the garment, and localising them would make the guide actively wrong.
 */

export type ChartKind = 'clothing' | 'footwear' | 'trousers' | 'belts';

export interface SizeChart {
  kind: ChartKind;
  /** Locale key under `sizeGuide.columns.*` for each column. */
  columns: string[];
  rows: string[][];
  /** Locale key for the measuring note shown under the table. */
  noteKey: string;
}

const MEN_CLOTHING: SizeChart = {
  kind: 'clothing',
  columns: ['size', 'eu', 'uk', 'us', 'chest', 'waist'],
  rows: [
    ['XS', '44', '34', '34', '86–91', '71–76'],
    ['S', '46', '36', '36', '91–97', '76–81'],
    ['M', '48–50', '38–40', '38–40', '97–102', '81–87'],
    ['L', '52', '42', '42', '102–107', '87–92'],
    ['XL', '54', '44', '44', '107–112', '92–97'],
    ['XXL', '56', '46', '46', '112–122', '97–107'],
  ],
  noteKey: 'clothingMen',
};

const WOMEN_CLOTHING: SizeChart = {
  kind: 'clothing',
  columns: ['size', 'eu', 'uk', 'us', 'bust', 'waist'],
  rows: [
    ['XS', '32–34', '6', '2', '78–82', '60–64'],
    ['S', '36', '8', '4', '82–86', '64–68'],
    ['M', '38', '10', '6', '86–90', '68–72'],
    ['L', '40', '12', '8', '90–95', '72–77'],
    ['XL', '42', '14', '10', '95–100', '77–82'],
    ['XXL', '44', '16', '12', '100–106', '82–88'],
  ],
  noteKey: 'clothingWomen',
};

const UNISEX_CLOTHING: SizeChart = {
  kind: 'clothing',
  columns: ['size', 'eu', 'uk', 'us', 'chest'],
  rows: [
    ['XS', '44', '34', '34', '86–91'],
    ['S', '46', '36', '36', '91–97'],
    ['M', '48–50', '38–40', '38–40', '97–102'],
    ['L', '52', '42', '42', '102–107'],
    ['XL', '54', '44', '44', '107–112'],
    ['XXL', '56', '46', '46', '112–122'],
  ],
  noteKey: 'clothingUnisex',
};

const KIDS_CLOTHING: SizeChart = {
  kind: 'clothing',
  columns: ['size', 'age', 'eu', 'uk', 'us', 'height'],
  rows: [
    ['4Y', '3–4', '104', '3–4', '4', '100–110'],
    ['6Y', '5–6', '116', '5–6', '6', '110–120'],
    ['8Y', '7–8', '128', '7–8', '8', '122–132'],
    ['10Y', '9–10', '140', '9–10', '10', '134–144'],
    ['12Y', '11–12', '152', '11–12', '12', '146–156'],
  ],
  noteKey: 'clothingKids',
};

const MEN_FOOTWEAR: SizeChart = {
  kind: 'footwear',
  columns: ['eu', 'uk', 'us', 'foot'],
  rows: [
    ['39', '6', '6.5', '24.5'],
    ['40', '6.5', '7', '25.0'],
    ['41', '7.5', '8', '25.5'],
    ['42', '8', '8.5', '26.5'],
    ['43', '9', '9.5', '27.5'],
    ['44', '9.5', '10', '28.0'],
    ['45', '10.5', '11', '29.0'],
    ['46', '11', '11.5', '29.5'],
  ],
  noteKey: 'footwear',
};

const WOMEN_FOOTWEAR: SizeChart = {
  kind: 'footwear',
  columns: ['eu', 'uk', 'us', 'foot'],
  rows: [
    ['35', '2.5', '4.5', '22.0'],
    ['36', '3.5', '5.5', '22.5'],
    ['37', '4', '6.5', '23.5'],
    ['38', '5', '7.5', '24.0'],
    ['39', '6', '8.5', '25.0'],
    ['40', '6.5', '9', '25.5'],
    ['41', '7.5', '10', '26.0'],
    ['42', '8', '10.5', '26.5'],
  ],
  noteKey: 'footwear',
};

const UNISEX_FOOTWEAR: SizeChart = {
  kind: 'footwear',
  columns: ['eu', 'uk', 'usMen', 'usWomen', 'foot'],
  rows: [
    ['38', '5', '5.5', '7', '24.0'],
    ['39', '6', '6.5', '8', '24.5'],
    ['40', '6.5', '7', '8.5', '25.0'],
    ['41', '7.5', '8', '9.5', '25.5'],
    ['42', '8', '8.5', '10', '26.5'],
    ['43', '9', '9.5', '11', '27.5'],
    ['44', '9.5', '10', '11.5', '28.0'],
    ['45', '10.5', '11', '12.5', '29.0'],
  ],
  noteKey: 'footwearUnisex',
};

const KIDS_FOOTWEAR: SizeChart = {
  kind: 'footwear',
  columns: ['eu', 'uk', 'us', 'foot'],
  rows: [
    ['26', '8.5', '9.5', '16.0'],
    ['28', '10', '11', '17.0'],
    ['30', '11.5', '12.5', '18.5'],
    ['32', '13', '1', '20.0'],
    ['34', '2', '3', '21.5'],
    ['36', '3.5', '4.5', '22.5'],
  ],
  noteKey: 'footwearKids',
};

const MEN_TROUSERS: SizeChart = {
  kind: 'trousers',
  columns: ['sizeInches', 'eu', 'waist', 'hip', 'inseam'],
  rows: [
    ['28', '44', '71', '88', '81'],
    ['30', '46', '76', '93', '81'],
    ['32', '48', '81', '98', '82'],
    ['34', '50', '87', '104', '82'],
    ['36', '52', '92', '109', '83'],
    ['38', '54', '97', '114', '83'],
  ],
  noteKey: 'trousers',
};

const WOMEN_TROUSERS: SizeChart = {
  kind: 'trousers',
  columns: ['sizeInches', 'eu', 'uk', 'waist', 'hip'],
  rows: [
    ['24', '32', '4', '61', '86'],
    ['25', '34', '6', '64', '89'],
    ['26', '36', '8', '66', '91'],
    ['27', '38', '10', '69', '94'],
    ['28', '40', '12', '71', '97'],
    ['30', '42', '14', '76', '102'],
  ],
  noteKey: 'trousers',
};

const BELTS: SizeChart = {
  kind: 'belts',
  columns: ['size', 'waistInches', 'length'],
  rows: [
    ['85', '30–32', '100'],
    ['90', '32–34', '105'],
    ['95', '34–36', '110'],
    ['100', '36–38', '115'],
    ['105', '38–40', '120'],
  ],
  noteKey: 'belts',
};

/** Every chart available for a given audience, in display order. */
export const CHARTS_BY_AUDIENCE: Record<TargetGroup, SizeChart[]> = {
  MEN: [MEN_CLOTHING, MEN_FOOTWEAR, MEN_TROUSERS, BELTS],
  WOMEN: [WOMEN_CLOTHING, WOMEN_FOOTWEAR, WOMEN_TROUSERS, BELTS],
  KIDS: [KIDS_CLOTHING, KIDS_FOOTWEAR],
  UNISEX: [UNISEX_CLOTHING, UNISEX_FOOTWEAR, MEN_TROUSERS, BELTS],
};

/**
 * Infers which chart a product's own sizes belong to, so the guide opens on the
 * table the shopper actually needs rather than making them pick.
 *
 * The audience is required because bare numbers are ambiguous: 32 is a kids'
 * shoe and a men's waist, and 34 is both in the same catalogue. Within one
 * audience the scales no longer overlap — adult footwear starts at 39 where
 * adult waists stop at 38 — so the group is what makes the guess safe.
 */
export function chartKindForSizes(
  sizes: Array<string | null>,
  audience: TargetGroup,
): ChartKind | null {
  const values = sizes.filter((s): s is string => Boolean(s));
  if (values.length === 0) return null;
  if (values.every((s) => s === 'One Size')) return null;
  if (values.some((s) => /^(XS|S|M|L|XL|XXL)$/i.test(s))) return 'clothing';
  // Kids' clothing is sized in years: 4Y, 6Y, 8Y…
  if (values.some((s) => /^\d+Y$/i.test(s))) return 'clothing';

  const numeric = values.map(Number).filter((n) => Number.isFinite(n));
  if (numeric.length === 0) return null;
  if (numeric.every((n) => n >= 80)) return 'belts';
  // Childrenswear only ever numbers footwear, so anything numeric is a shoe.
  if (audience === 'KIDS') return 'footwear';
  if (numeric.every((n) => n >= 39)) return 'footwear';
  if (numeric.every((n) => n <= 38)) return 'trousers';
  return 'footwear';
}
