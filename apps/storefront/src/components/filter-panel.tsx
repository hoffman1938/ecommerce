'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { COLOR_HEX } from '@outlet/catalog';
import { CheckIcon, ChevronDown, CloseIcon, cx } from '@outlet/ui';
import { track } from '@/lib/analytics';

export const SORTS = [
  ['recommended', 'Recommended'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['discount', 'Highest discount'],
  ['rating', 'Best rated'],
  ['popularity', 'Popularity'],
] as const;

const SIZES = ['S', 'M', 'L', 'XL', '30', '32', '34', '36', '40', '41', '42', '43', '44'];
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

/**
 * Swatches come from the catalogue's own colour table, so the dot in the filter
 * is literally the colour the product artwork is rendered in. Keeping a second
 * hand-maintained list here is how the two drift apart.
 */
const COLORS: Array<[string, string]> = Object.entries(COLOR_HEX);

/** Featured brands, in the order the storefront presents them elsewhere. */
const BRANDS: Array<[string, string]> = [
  ['adidas', 'Adidas'],
  ['nike', 'Nike'],
  ['puma', 'Puma'],
  ['tommy-hilfiger', 'Tommy Hilfiger'],
  ['calvin-klein', 'Calvin Klein'],
  ['levis', 'Levi’s'],
  ['new-balance', 'New Balance'],
  ['the-north-face', 'The North Face'],
  ['lacoste', 'Lacoste'],
  ['champion', 'Champion'],
];

const RATINGS = [
  ['4', '4 stars & up'],
  ['3', '3 stars & up'],
] as const;

const FILTER_KEYS = [
  'brand',
  'size',
  'color',
  'targetGroup',
  'minPrice',
  'maxPrice',
  'minDiscount',
  'minRating',
  'inStock',
] as const;

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
      if (value) track('filter_used', { filter: key, value });
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

/**
 * A collapsible facet group.
 *
 * Eight expanded groups make a sidebar taller than the viewport, which pushes
 * everything below the third facet out of sight and turns the whole panel into
 * a scroll-within-a-scroll. Groups whose contents are long start closed, and a
 * group that already has something applied always starts open — otherwise a
 * filter could be in effect with no visible sign of it.
 */
function Group({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Shown beside the title when the group is collapsed but active. */
  badge?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || Boolean(badge));

  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 py-1 text-left text-sm font-semibold text-ink-950"
        >
          <span className="flex items-baseline gap-2">
            {title}
            {!open && badge ? (
              <span className="truncate text-xs font-normal text-ink-500">{badge}</span>
            ) : null}
          </span>
          <ChevronDown
            className={cx(
              'h-4 w-4 shrink-0 text-ink-400 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      {open ? <div className="mt-2.5">{children}</div> : null}
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
          selected
            ? 'font-medium text-ink-950 dark:bg-surface-active'
            : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950 dark:hover:bg-surface-hover',
        )}
      >
        {label}
        {selected ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
      </button>
    </li>
  );
}

/**
 * Min/max price.
 *
 * Kept as a local draft and only committed on submit or blur — pushing a new
 * URL on every keystroke would refetch the grid four times while someone types
 * "120", and each push would fight the cursor.
 */
function PriceRange() {
  const { params, setParam } = useFilters();
  const min = params.get('minPrice') ?? '';
  const max = params.get('maxPrice') ?? '';
  const [draft, setDraft] = useState({ min, max });

  // Follow the URL when it changes elsewhere — a chip being removed, say.
  useEffect(() => setDraft({ min, max }), [min, max]);

  const commit = () => {
    const nextMin = draft.min.trim();
    const nextMax = draft.max.trim();
    // A backwards range returns nothing and looks broken; swap it instead.
    const lo = Number(nextMin);
    const hi = Number(nextMax);
    const swap = nextMin && nextMax && Number.isFinite(lo) && Number.isFinite(hi) && lo > hi;
    setParam('minPrice', (swap ? nextMax : nextMin) || null);
    setParam('maxPrice', (swap ? nextMin : nextMax) || null);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
      className="flex items-center gap-2"
    >
      <label className="flex-1">
        <span className="sr-only">Minimum price</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Min"
          value={draft.min}
          onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))}
          onBlur={commit}
          className="h-9 w-full rounded bg-ink-25 px-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 placeholder:text-ink-400 focus:ring-ink-950 dark:bg-surface-sunken dark:ring-line-strong dark:placeholder:text-content-muted dark:hover:bg-surface dark:hover:ring-ink-600"
        />
      </label>
      <span aria-hidden="true" className="text-ink-400">
        –
      </span>
      <label className="flex-1">
        <span className="sr-only">Maximum price</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Max"
          value={draft.max}
          onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
          onBlur={commit}
          className="h-9 w-full rounded bg-ink-25 px-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 placeholder:text-ink-400 focus:ring-ink-950 dark:bg-surface-sunken dark:ring-line-strong dark:placeholder:text-content-muted dark:hover:bg-surface dark:hover:ring-ink-600"
        />
      </label>
      <button type="submit" className="sr-only">
        Apply price range
      </button>
    </form>
  );
}

export function FilterPanel() {
  const { params, setParam } = useFilters();
  const current = (key: string) => params.get(key);
  const toggle = (key: string, value: string) =>
    setParam(key, current(key) === value ? null : value);

  const minPrice = current('minPrice');
  const maxPrice = current('maxPrice');
  const priceBadge =
    minPrice && maxPrice
      ? `€${minPrice}–€${maxPrice}`
      : minPrice
        ? `From €${minPrice}`
        : maxPrice
          ? `Up to €${maxPrice}`
          : null;

  return (
    <div>
      <Group title="Availability">
        <label className="flex cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={current('inStock') === 'true'}
            onChange={(e) => setParam('inStock', e.target.checked ? 'true' : null)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded-xs border-ink-300 accent-ink-950 text-ink-950 focus:ring-ink-950"
          />
          In stock only
        </label>
      </Group>

      <Group
        title="Brand"
        defaultOpen={false}
        badge={BRANDS.find(([s]) => s === current('brand'))?.[1] ?? null}
      >
        <ul className="space-y-0.5">
          {BRANDS.map(([slug, name]) => (
            <OptionRow
              key={slug}
              label={name}
              selected={current('brand') === slug}
              onSelect={() => toggle('brand', slug)}
            />
          ))}
        </ul>
      </Group>

      <Group title="Price" defaultOpen={false} badge={priceBadge}>
        <PriceRange />
      </Group>

      <Group title="Size" badge={current('size') ? `Size ${current('size')}` : null}>
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
                    ? 'bg-ink-950 text-ink-25'
                    : 'text-ink-700 ring-1 ring-inset ring-ink-300 hover:ring-ink-950 dark:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600',
                )}
              >
                {size}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Colour" defaultOpen={false} badge={current('color')}>
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
                      ? 'font-medium text-ink-950 dark:bg-surface-active'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950 dark:hover:bg-surface-hover',
                  )}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-ink-950/15 dark:ring-ink-950/30"
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

      <Group
        title="Discount"
        defaultOpen={false}
        badge={current('minDiscount') ? `${current('minDiscount')}%+` : null}
      >
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

      <Group
        title="Customer rating"
        defaultOpen={false}
        badge={current('minRating') ? `${current('minRating')}★ & up` : null}
      >
        <ul className="space-y-0.5">
          {RATINGS.map(([value, label]) => (
            <OptionRow
              key={value}
              label={label}
              selected={current('minRating') === value}
              onSelect={() => toggle('minRating', value)}
            />
          ))}
        </ul>
      </Group>

      <Group
        title="Audience"
        defaultOpen={false}
        badge={GROUPS.find(([v]) => v === current('targetGroup'))?.[1] ?? null}
      >
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

  // Each chip carries how to clear itself: a price range is one chip but two
  // parameters, so a single key would leave half the filter applied.
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  const chip = (key: string, label: string, keys: string[] = [key]) =>
    chips.push({ key, label, remove: () => keys.forEach((k) => setParam(k, null)) });

  const brand = params.get('brand');
  if (brand) chip('brand', BRANDS.find(([s]) => s === brand)?.[1] ?? brand);
  const size = params.get('size');
  if (size) chip('size', `Size ${size}`);
  const minPrice = params.get('minPrice');
  const maxPrice = params.get('maxPrice');
  if (minPrice || maxPrice) {
    chip(
      'price',
      minPrice && maxPrice
        ? `€${minPrice}–€${maxPrice}`
        : minPrice
          ? `From €${minPrice}`
          : `Up to €${maxPrice}`,
      ['minPrice', 'maxPrice'],
    );
  }
  const color = params.get('color');
  if (color) chip('color', color);
  const group = params.get('targetGroup');
  if (group) chip('targetGroup', GROUPS.find(([v]) => v === group)?.[1] ?? group);
  const discount = params.get('minDiscount');
  if (discount) chip('minDiscount', `${discount}%+ off`);
  const rating = params.get('minRating');
  if (rating) chip('minRating', `${rating}★ & up`);
  if (params.get('inStock') === 'true') chip('inStock', 'In stock');

  return (
    <div className="flex flex-wrap items-center gap-2 pb-5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="group inline-flex h-7 items-center gap-1.5 rounded bg-ink-100 pl-2.5 pr-2 text-xs font-medium text-ink-800 transition-colors duration-150 hover:bg-ink-200 dark:bg-surface-active dark:text-ink-800 dark:ring-1 dark:ring-inset dark:ring-line dark:hover:bg-surface-hover dark:hover:ring-line-strong"
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
        className="h-9 cursor-pointer rounded bg-ink-25 pl-2.5 pr-8 text-sm font-medium text-ink-900 ring-1 ring-inset ring-ink-300 transition-shadow duration-150 hover:ring-ink-400 dark:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600"
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
