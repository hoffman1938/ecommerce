'use client';

import { useState } from 'react';
import { CloseIcon } from '@outlet/ui';

/**
 * Size guide.
 *
 * Sizing is the single biggest reason clothing gets returned, so the table is
 * one click from the size selector rather than buried in a tab. Which table to
 * show is inferred from the sizes the product actually has, so a shoe never
 * offers a chest measurement.
 */

type GuideKind = 'clothing' | 'shoes' | 'waist' | 'belt' | 'none';

interface GuideTable {
  title: string;
  note: string;
  columns: string[];
  rows: string[][];
}

const CLOTHING: GuideTable = {
  title: 'Clothing — regular fit',
  note: 'Measure across the body, not over other clothing. If you are between sizes, size up for a relaxed fit.',
  columns: ['Size', 'Chest (cm)', 'Waist (cm)', 'Length (cm)'],
  rows: [
    ['XS', '86–91', '71–76', '68'],
    ['S', '91–97', '76–81', '70'],
    ['M', '97–102', '81–87', '72'],
    ['L', '102–107', '87–92', '74'],
    ['XL', '107–112', '92–97', '76'],
    ['XXL', '112–122', '97–107', '78'],
  ],
};

const SHOES: GuideTable = {
  title: 'Footwear',
  note: 'Measure your foot from heel to longest toe while standing. Sizes run true; wide feet may prefer a half size up.',
  columns: ['EU', 'UK', 'US (M)', 'Foot length (cm)'],
  rows: [
    ['39', '6', '6.5', '24.5'],
    ['40', '6.5', '7.5', '25.0'],
    ['41', '7.5', '8', '25.5'],
    ['42', '8', '9', '26.5'],
    ['43', '9', '10', '27.5'],
    ['44', '9.5', '10.5', '28.0'],
    ['45', '10.5', '11.5', '29.0'],
  ],
};

const WAIST: GuideTable = {
  title: 'Trousers & jeans',
  note: 'Sizes are the waist measurement in inches. Measure around your natural waistline.',
  columns: ['Size (in)', 'Waist (cm)', 'Hip (cm)', 'Inseam (cm)'],
  rows: [
    ['28', '71', '88', '81'],
    ['30', '76', '93', '81'],
    ['32', '81', '98', '82'],
    ['34', '87', '104', '82'],
    ['36', '92', '109', '83'],
    ['38', '97', '114', '83'],
  ],
};

const BELT: GuideTable = {
  title: 'Belts',
  note: 'Belt size is the length in centimetres to the middle hole. Choose roughly 10 cm above your trouser waist size.',
  columns: ['Size', 'Trouser waist (in)', 'Total length (cm)'],
  rows: [
    ['85', '30–32', '100'],
    ['90', '32–34', '105'],
    ['95', '34–36', '110'],
    ['100', '36–38', '115'],
  ],
};

const TABLES: Record<Exclude<GuideKind, 'none'>, GuideTable> = {
  clothing: CLOTHING,
  shoes: SHOES,
  waist: WAIST,
  belt: BELT,
};

/** Picks the right table from the sizes the product is actually sold in. */
export function guideKindForSizes(sizes: Array<string | null>): GuideKind {
  const values = sizes.filter((s): s is string => Boolean(s));
  if (values.length === 0) return 'none';
  if (values.every((s) => s === 'One Size')) return 'none';
  if (values.some((s) => /^(XS|S|M|L|XL|XXL)$/i.test(s))) return 'clothing';

  const numeric = values.map(Number).filter((n) => Number.isFinite(n));
  if (numeric.length === 0) return 'none';
  if (numeric.every((n) => n >= 80)) return 'belt';
  if (numeric.every((n) => n >= 36 && n <= 50)) return 'shoes';
  if (numeric.every((n) => n >= 24 && n <= 44)) return 'waist';
  return 'none';
}

export function SizeGuide({ sizes }: { sizes: Array<string | null> }) {
  const [open, setOpen] = useState(false);
  const kind = guideKindForSizes(sizes);
  if (kind === 'none') return null;

  const table = TABLES[kind];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-ink-600 underline underline-offset-2 transition-colors hover:text-ink-950"
      >
        Size guide
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="size-guide-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t bg-ink-25 p-6 shadow-xl sm:rounded">
            <div className="flex items-start justify-between gap-4">
              <h2 id="size-guide-title" className="text-lg font-bold text-ink-950">
                {table.title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close size guide"
                className="-m-1.5 p-1.5 text-ink-500 transition-colors hover:text-ink-950"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-ink-600">{table.note}</p>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-300">
                    {table.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="py-2 pr-4 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-ink-100">
                      {row.map((cell, i) => (
                        <td
                          key={i}
                          data-numeric
                          className={
                            i === 0
                              ? 'py-2 pr-4 font-semibold text-ink-950'
                              : 'py-2 pr-4 text-ink-700'
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-ink-500">
              Still unsure? Order two sizes and return the one that does not fit — returns are free
              within 30 days.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
