'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TargetGroup } from '@outlet/types';
import { CloseIcon, cx } from '@outlet/ui';
import { AUDIENCES } from '@/lib/audience';
import { CHARTS_BY_AUDIENCE, chartKindForSizes, type ChartKind } from '@/lib/size-charts';
import { useI18n } from '@/lib/i18n';

/**
 * Size guide.
 *
 * Sizing is the single biggest reason clothing gets returned, so the guide is
 * one tap from the size selector rather than buried in a tab, and it converts
 * between the three systems a European outlet actually gets asked about —
 * EU, UK and US — with a body or foot measurement in centimetres as the
 * tie-breaker. UK and US womenswear disagree by two full sizes, so a chart that
 * offered only one of them was giving half an answer.
 *
 * Two levels of navigation, both of which change the table live:
 *   audience  Men / Women / Kids / Unisex
 *   chart     Clothing / Footwear / Trousers / Belts, filtered to that audience
 *
 * Both open on the product being viewed — its target group and the scale its
 * own sizes are drawn on — so the common case costs no clicks, while the rest
 * of the catalogue's sizing stays one tap away.
 */
export function SizeGuide({
  sizes,
  targetGroup = 'UNISEX',
}: {
  sizes: Array<string | null>;
  targetGroup?: TargetGroup;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const productKind = useMemo(() => chartKindForSizes(sizes, targetGroup), [sizes, targetGroup]);

  const [audience, setAudience] = useState<TargetGroup>(targetGroup);
  const [kind, setKind] = useState<ChartKind>(productKind ?? 'clothing');

  // Reopening after switching colourway or product should land on that
  // product's chart again, not on wherever the last visit was left.
  useEffect(() => {
    if (!open) return;
    setAudience(targetGroup);
    setKind(productKind ?? 'clothing');
  }, [open, targetGroup, productKind]);

  const charts = CHARTS_BY_AUDIENCE[audience];
  // Kids have no trouser or belt chart, so a kind carried over from another
  // audience has to fall back rather than render an empty table.
  const chart = charts.find((c) => c.kind === kind) ?? charts[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!productKind && sizes.filter(Boolean).length === 0) return null;

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
          <div className="flex max-h-[90vh] w-full max-w-2xl animate-slide-up flex-col overflow-hidden rounded-t-xl bg-ink-25 shadow-xl dark:border dark:border-line dark:bg-surface-raised dark:shadow-lg sm:rounded-xl">
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
                {AUDIENCES.map((a) => {
                  const active = audience === a.group;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setAudience(a.group)}
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
                    const active = chart.kind === c.kind;
                    return (
                      <button
                        key={c.kind}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setKind(c.kind)}
                        className={cx(
                          'shrink-0 rounded px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors duration-150',
                          active
                            ? 'bg-surface-active text-ink-950 ring-line-strong'
                            : 'text-ink-600 ring-line hover:bg-surface-hover hover:text-ink-950',
                        )}
                      >
                        {t(`sizeGuide.kind.${c.kind}`)}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* The table scrolls inside its own container so a six-column
                  chart never forces the dialog itself sideways on a phone. */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line-strong">
                      {chart.columns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="whitespace-nowrap py-2 pr-4 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500"
                        >
                          {t(`sizeGuide.columns.${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((row) => {
                      // Highlight the rows this product is actually sold in.
                      const owned = sizes.filter(Boolean).includes(row[0]);
                      return (
                        <tr
                          key={row.join('-')}
                          className={cx(
                            'border-b border-line last:border-b-0',
                            owned && 'bg-surface-hover',
                          )}
                        >
                          {row.map((cell, i) => (
                            <td
                              key={i}
                              data-numeric
                              className={cx(
                                'whitespace-nowrap py-2 pr-4',
                                i === 0 ? 'font-semibold text-ink-950' : 'text-ink-700',
                              )}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                {t(`sizeGuide.notes.${chart.noteKey}`)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">{t('sizeGuide.returns')}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
