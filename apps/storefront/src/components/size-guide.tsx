'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SizeChartGroup, TargetGroup } from '@outlet/types';
import {
  SIZE_GUIDE_METADATA,
  chartHasItEuNote,
  resolveSizeChart,
  sizeChartsForAudience,
  sizeColumnLabel,
  type SizeChartData,
} from '@outlet/catalog';
import { CloseIcon, cx } from '@outlet/ui';
import { AUDIENCES } from '@/lib/audience';
import { useI18n } from '@/lib/i18n';

/**
 * Size guide.
 *
 * Sizing is the single biggest reason clothing gets returned, so the guide is
 * one tap from the size selector rather than buried in a tab. Every number in
 * it comes from the shipped conversion data; nothing is derived, rounded or
 * interpolated here, and every system that data publishes for a chart — US, UK,
 * EU, IT, FR, JP, International — is a column rather than a hidden alternative.
 *
 * Which chart opens is decided by the product, not by the shopper: a men's
 * shirt opens on collar sizes, a women's jean on waist measurements, a kids'
 * hoodie on age and height. The rest of the catalogue's sizing stays one tap
 * away behind the audience and chart tabs.
 *
 * The whole component renders nothing at all when the product's category has no
 * sizing behind it. There is no footwear, bag or accessory data in the source,
 * so a sneaker page has no size guide rather than an empty table or — worse —
 * a borrowed one.
 */
export function SizeGuide({
  sizes,
  targetGroup = 'UNISEX',
  sizeChartGroup,
}: {
  sizes: Array<string | null>;
  targetGroup?: TargetGroup;
  /** Inherited from the product's category; null means "not a sized garment". */
  sizeChartGroup?: SizeChartGroup | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const productChart = useMemo(
    () => resolveSizeChart(sizeChartGroup, targetGroup),
    [sizeChartGroup, targetGroup],
  );

  const [audience, setAudience] = useState<TargetGroup>(targetGroup);
  const [chartId, setChartId] = useState<string | null>(productChart?.id ?? null);

  // Reopening after switching colourway or product should land on that
  // product's chart again, not on wherever the last visit was left.
  useEffect(() => {
    if (!open) return;
    setAudience(productChart?.audience ?? targetGroup);
    setChartId(productChart?.id ?? null);
  }, [open, targetGroup, productChart]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const charts = sizeChartsForAudience(audience);
  // An audience carried over from another tab may not publish the chart that
  // was selected, so fall back rather than render an empty table.
  const chart = charts.find((c) => c.id === chartId) ?? charts[0];

  // No data for this product's category and audience — no guide.
  if (!productChart) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-ink-600 underline underline-offset-2 transition-colors hover:text-ink-950"
      >
        {t('sizeGuide.open')}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-scrim-950/50 p-0 dark:bg-scrim-950/70 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="size-guide-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl animate-slide-up flex-col overflow-hidden rounded-t-xl bg-ink-25 shadow-xl dark:border dark:border-line dark:bg-surface-raised dark:shadow-lg sm:rounded-xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="size-guide-title" className="text-lg font-bold text-ink-950">
                  {t('sizeGuide.title')}
                </h2>
                <p className="mt-0.5 text-sm text-ink-500">{t('sizeGuide.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('sizeGuide.close')}
                className="-m-1.5 shrink-0 rounded p-1.5 text-ink-500 transition-colors hover:bg-surface-hover hover:text-ink-950"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
              {/* Audience */}
              <div
                role="tablist"
                aria-label={t('sizeGuide.audienceLabel')}
                className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
              >
                {AUDIENCES.filter((a) => sizeChartsForAudience(a.group).length > 0).map((a) => {
                  const active = audience === a.group;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setAudience(a.group);
                        setChartId(null);
                      }}
                      className={cx(
                        'shrink-0 rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                        active
                          ? 'bg-accent text-accent-contrast'
                          : 'text-ink-600 hover:bg-surface-hover hover:text-ink-950',
                      )}
                    >
                      {t(`audience.${a.key}`)}
                    </button>
                  );
                })}
              </div>

              {/* Chart within the audience */}
              {charts.length > 1 ? (
                <div
                  role="tablist"
                  aria-label={t('sizeGuide.chartLabel')}
                  className="scrollbar-none -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1"
                >
                  {charts.map((c) => {
                    const active = chart.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setChartId(c.id)}
                        className={cx(
                          'shrink-0 rounded px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors duration-150',
                          active
                            ? 'bg-surface-active text-ink-950 ring-line-strong'
                            : 'text-ink-600 ring-line hover:bg-surface-hover hover:text-ink-950',
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <SizeChartTable chart={chart} sizes={sizes} />

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                {t(`sizeGuide.notes.${chart.type}`)}
              </p>
              {chartHasItEuNote(chart) ? (
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  {SIZE_GUIDE_METADATA.noteOnItVsEu}
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-relaxed text-ink-500">{t('sizeGuide.returns')}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * One chart, every column the source publishes for it.
 *
 * Sizes themselves are never translated — "M", "42" and "10Y" are codes printed
 * on the garment, and localising them would make the guide actively wrong. Only
 * the column headings get a language.
 */
function SizeChartTable({ chart, sizes }: { chart: SizeChartData; sizes: Array<string | null> }) {
  const owned = useMemo(() => new Set(sizes.filter((s): s is string => Boolean(s))), [sizes]);

  return (
    <>
      <p className="mt-4 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500">
        {chart.unitSystem}
      </p>
      {/* The table scrolls inside its own container so a nine-column chart never
          forces the dialog itself sideways on a phone. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong">
              {chart.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap py-2 pr-4 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500"
                >
                  {sizeColumnLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row, rowIndex) => {
              // Highlight the rows this product is actually sold in, whichever
              // system its own labels happen to be printed in.
              const mine = chart.columns.some((column) => owned.has(row[column]));
              return (
                <tr
                  key={`${chart.id}-${rowIndex}`}
                  className={cx('border-b border-line last:border-b-0', mine && 'bg-surface-hover')}
                >
                  {chart.columns.map((column, columnIndex) => (
                    <td
                      key={column}
                      data-numeric
                      className={cx(
                        'whitespace-nowrap py-2 pr-4',
                        columnIndex === 0 ? 'font-semibold text-ink-950' : 'text-ink-700',
                      )}
                    >
                      {row[column] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
