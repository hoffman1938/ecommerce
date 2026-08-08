'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { CheckIcon, CloseIcon, cx } from '@outlet/ui';

export const SORTS = [
  ['recommended', 'Recommended'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['discount', 'Highest discount'],
  ['popularity', 'Popularity'],
] as const;

const SIZES = ['S', 'M', 'L', 'XL', '40', '41', '42', '43', '44'];
const GROUPS = [
  ['MEN', 'Men'],
  ['WOMEN', 'Women'],
  ['KIDS', 'Kids'],
  ['UNISEX', 'Unisex'],
] as const;
const DISCOUNTS = [
  ['20', '20% or more'],
  ['30', '30% or more'],
  ['40', '40% or more'],
  ['50', '50% or more'],
] as const;

/** Matches the swatch colours used by the seeded catalog imagery. */
const COLORS: Array<[string, string]> = [
  ['Black', '#1f2937'],
  ['White', '#e5e7eb'],
  ['Grey', '#6b7280'],
  ['Navy', '#1e3a5f'],
  ['Blue', '#2563eb'],
  ['Red', '#dc2626'],
  ['Green', '#16a34a'],
  ['Pink', '#ec4899'],
  ['Beige', '#d6c7a1'],
  ['Orange', '#ea580c'],
];

const FILTER_KEYS = ['size', 'color', 'targetGroup', 'minDiscount', 'inStock'] as const;

/** Reads and writes the filter query string, resetting pagination on change. */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Any facet change invalidates the current page number.
      if (key !== 'page') next.delete('page');
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams();
    // Keep the search term; clearing filters should not clear the query.
    const q = params.get('q');
    if (q) next.set('q', q);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const activeCount = FILTER_KEYS.filter((key) => params.get(key)).length;

  return { params, setParam, clearAll, activeCount };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink-200 py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold text-ink-950">{title}</h3>
      {children}
    </div>
  );
}

/** Radio-style option row. Selecting the active one clears it. */
function OptionRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cx(
          'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors',
          selected ? 'font-medium text-ink-950' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950',
        )}
      >
        {label}
        {selected ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
      </button>
    </li>
  );
}

export function FilterPanel() {
  const { params, setParam } = useFilters();
  const current = (key: string) => params.get(key);
  const toggle = (key: string, value: string) =>
    setParam(key, current(key) === value ? null : value);

  return (
    <div>
      <Group title="Availability">
        <label className="flex cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={current('inStock') === 'true'}
            onChange={(e) => setParam('inStock', e.target.checked ? 'true' : null)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded-xs border-ink-300 text-ink-950 focus:ring-ink-950"
          />
          In stock only
        </label>
      </Group>

      <Group title="Size">
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((size) => {
            const selected = current('size') === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => toggle('size', size)}
                aria-pressed={selected}
                className={cx(
                  'h-9 min-w-[2.75rem] rounded px-2 text-sm font-medium transition-colors',
                  selected
                    ? 'bg-ink-950 text-white'
                    : 'text-ink-700 ring-1 ring-inset ring-ink-300 hover:ring-ink-950',
                )}
              >
                {size}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Colour">
        <ul className="space-y-0.5">
          {COLORS.map(([name, hex]) => {
            const selected = current('color') === name;
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => toggle('color', name)}
                  aria-pressed={selected}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm transition-colors',
                    selected
                      ? 'font-medium text-ink-950'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950',
                  )}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-ink-950/15"
                    style={{ backgroundColor: hex }}
                    aria-hidden="true"
                  />
                  {name}
                  {selected ? <CheckIcon className="ml-auto h-4 w-4 shrink-0" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title="Discount">
        <ul className="space-y-0.5">
          {DISCOUNTS.map(([value, label]) => (
            <OptionRow
              key={value}
              label={label}
              selected={current('minDiscount') === value}
              onSelect={() => toggle('minDiscount', value)}
            />
          ))}
        </ul>
      </Group>

      <Group title="Audience">
        <ul className="space-y-0.5">
          {GROUPS.map(([value, label]) => (
            <OptionRow
              key={value}
              label={label}
              selected={current('targetGroup') === value}
              onSelect={() => toggle('targetGroup', value)}
            />
          ))}
        </ul>
      </Group>
    </div>
  );
}

/** Removable chips summarising what is currently filtered. */
export function ActiveFilters() {
  const { params, setParam, clearAll, activeCount } = useFilters();
  if (activeCount === 0) return null;

  const chips: Array<{ key: string; label: string }> = [];
  const size = params.get('size');
  if (size) chips.push({ key: 'size', label: `Size ${size}` });
  const color = params.get('color');
  if (color) chips.push({ key: 'color', label: color });
  const group = params.get('targetGroup');
  if (group) {
    chips.push({
      key: 'targetGroup',
      label: GROUPS.find(([v]) => v === group)?.[1] ?? group,
    });
  }
  const discount = params.get('minDiscount');
  if (discount) chips.push({ key: 'minDiscount', label: `${discount}%+ off` });
  if (params.get('inStock') === 'true') chips.push({ key: 'inStock', label: 'In stock' });

  return (
    <div className="flex flex-wrap items-center gap-2 pb-5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setParam(chip.key, null)}
          className="group inline-flex h-7 items-center gap-1.5 rounded bg-ink-100 pl-2.5 pr-2 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-200"
        >
          {chip.label}
          <CloseIcon className="h-3 w-3 text-ink-500 transition-colors group-hover:text-ink-900" />
          <span className="sr-only">Remove filter</span>
        </button>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="ml-1 text-xs font-medium text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
      >
        Clear all
      </button>
    </div>
  );
}

export function SortSelect() {
  const { params, setParam } = useFilters();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-ink-500">Sort</span>
      <select
        value={params.get('sort') ?? 'recommended'}
        onChange={(e) => setParam('sort', e.target.value === 'recommended' ? null : e.target.value)}
        className="h-9 cursor-pointer rounded bg-white pl-2.5 pr-8 text-sm font-medium text-ink-900 ring-1 ring-inset ring-ink-300 transition-shadow hover:ring-ink-400"
      >
        {SORTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
