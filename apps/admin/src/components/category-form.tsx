'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminCategoryDto, SizeChartGroup, TargetGroup } from '@outlet/types';
import { Button } from '@outlet/ui';

export interface CategoryFormValues {
  name: string;
  slug: string;
  pathSegment: string;
  parentId: string | null;
  targetGroup?: TargetGroup;
  sizeChartGroup: SizeChartGroup | null;
  isActive: boolean;
}

const TARGET_GROUPS: TargetGroup[] = ['MEN', 'WOMEN', 'KIDS', 'UNISEX'];

const SIZE_CHART_OPTIONS: Array<{ value: SizeChartGroup | ''; label: string }> = [
  { value: '', label: 'None — not a sized garment (shoes, bags, accessories)' },
  { value: 'tops', label: 'Tops — chest / bust measurements' },
  { value: 'shirts', label: 'Shirts — collar sizes' },
  { value: 'bottoms', label: 'Bottoms — waist measurements' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Create or edit one category.
 *
 * The level is never asked for: it follows from the parent, because a category
 * whose declared depth disagreed with where it actually hangs is a tree that
 * renders wrong and cannot be reasoned about. The same goes for the department
 * — only a root row gets to choose one, and everything below inherits it.
 */
export function CategoryFormDialog({
  node,
  parent,
  categories,
  busy,
  onSubmit,
  onCancel,
}: {
  node?: AdminCategoryDto;
  parent?: AdminCategoryDto;
  categories: AdminCategoryDto[];
  busy?: boolean;
  onSubmit: (values: CategoryFormValues) => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const parentNode = node ? categories.find((candidate) => candidate.id === node.parentId) : parent;
  const level = !parentNode
    ? 'department'
    : parentNode.level === 'department'
      ? 'category'
      : 'subcategory';

  const [name, setName] = useState(node?.name ?? '');
  const [segment, setSegment] = useState(node?.pathSegment ?? '');
  const [autoSegment, setAutoSegment] = useState(!node);
  const [targetGroup, setTargetGroup] = useState<TargetGroup>(
    node?.targetGroup ?? parentNode?.targetGroup ?? 'UNISEX',
  );
  const [sizeChartGroup, setSizeChartGroup] = useState<SizeChartGroup | ''>(
    node?.sizeChartGroup ?? '',
  );
  const [isActive, setIsActive] = useState(node?.isActive ?? true);

  const effectiveSegment = autoSegment ? slugify(name) : slugify(segment);
  const effectiveGroup = parentNode?.targetGroup ?? targetGroup;
  // Slugs carry the department so the same garment type can exist under several
  // of them; only a department itself needs no prefix.
  const slug =
    node?.slug ??
    (level === 'department'
      ? effectiveSegment
      : `${effectiveGroup.toLowerCase()}-${effectiveSegment}`);

  if (!mounted) return null;

  const canSubmit = Boolean(name.trim() && effectiveSegment) && !busy;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-black/40"
      />
      <form
        className="relative w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            name: name.trim(),
            slug,
            pathSegment: effectiveSegment,
            parentId: parentNode?.id ?? null,
            ...(level === 'department' ? { targetGroup } : {}),
            sizeChartGroup: sizeChartGroup || null,
            isActive,
          });
        }}
      >
        <h2 className="text-base font-semibold text-gray-900">
          {node
            ? `Edit ${node.name}`
            : parentNode
              ? `New child of ${parentNode.name}`
              : 'New department'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {level === 'department'
            ? 'A top-level department: Men, Women, Kids or Unisex.'
            : level === 'category'
              ? `A category under ${parentNode!.name} — Clothing, Shoes, Accessories.`
              : `A subcategory under ${parentNode!.name} — the garment type customers actually browse.`}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="category-name"
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          {level === 'department' && !node ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Audience</span>
              <select
                value={targetGroup}
                onChange={(event) => setTargetGroup(event.target.value as TargetGroup)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              >
                {TARGET_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-500">
                Products filed anywhere under this department inherit it.
              </span>
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 flex justify-between font-medium">
              URL fragment
              <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                <input
                  type="checkbox"
                  checked={autoSegment}
                  onChange={(event) => setAutoSegment(event.target.checked)}
                />
                from name
              </label>
            </span>
            <input
              value={autoSegment ? slugify(name) : segment}
              onChange={(event) => {
                setAutoSegment(false);
                setSegment(event.target.value);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            <span className="mt-1 block text-xs text-gray-500">
              /shop/
              {[...(parentNode?.path ?? []), effectiveSegment || '…'].join('/')} · slug{' '}
              <code>{slug || '…'}</code>
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Size chart</span>
            <select
              value={sizeChartGroup}
              onChange={(event) => setSizeChartGroup(event.target.value as SizeChartGroup | '')}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {SIZE_CHART_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              Products here show this chart on their page. “None” hides the size guide entirely
              rather than showing an empty table.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            <span>
              Visible to customers
              <span className="ml-1 text-xs text-gray-500">
                (still hidden while it has no available products)
              </span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <button
            type="submit"
            disabled={!canSubmit}
            data-testid="save-category"
            className="inline-flex h-10 items-center rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Saving…' : node ? 'Save changes' : 'Create'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
