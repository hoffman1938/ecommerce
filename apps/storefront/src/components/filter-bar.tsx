'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const SORTS = [
  ['recommended', 'Recommended'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['discount', 'Highest discount'],
  ['popularity', 'Popularity'],
] as const;

const SIZES = ['S', 'M', 'L', 'XL', '40', '41', '42', '43', '44'];
const COLORS = ['Black', 'White', 'Red', 'Blue', 'Navy', 'Grey', 'Green', 'Pink', 'Beige', 'Orange'];
const GROUPS = ['MEN', 'WOMEN', 'KIDS', 'UNISEX'];

/** URL-driven filters: every change updates query params, the server refetches. */
export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
  };

  const select = (key: string, label: string, options: Array<readonly [string, string]> | string[]) => (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <select
        value={params.get(key) ?? ''}
        onChange={(e) => setParam(key, e.target.value)}
        className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">Any</option>
        {options.map((option) => {
          const [value, text] = Array.isArray(option) ? option : [option, option];
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      {select('sort', 'Sort', SORTS as unknown as Array<readonly [string, string]>)}
      {select('size', 'Size', SIZES)}
      {select('color', 'Color', COLORS)}
      {select('targetGroup', 'For', GROUPS)}
      {select('minDiscount', 'Discount', [
        ['20', '20%+'],
        ['30', '30%+'],
        ['40', '40%+'],
        ['50', '50%+'],
      ] as unknown as Array<readonly [string, string]>)}
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={params.get('inStock') === 'true'}
          onChange={(e) => setParam('inStock', e.target.checked ? 'true' : '')}
        />
        <span className="text-gray-500">In stock only</span>
      </label>
      {[...params.keys()].some((k) => !['page'].includes(k)) ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="ml-auto text-sm text-gray-500 underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
