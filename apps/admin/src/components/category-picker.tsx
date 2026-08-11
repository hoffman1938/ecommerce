'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCategoryDto, TargetGroup } from '@outlet/types';
import { api, ApiError } from '@/lib/api';

/**
 * Department → Category → Subcategory, as three dependent selects.
 *
 * Filing a product is three decisions in a fixed order, and a flat list of
 * sixty category names is not that — "Boots" appears four times in it and
 * nothing tells you which one you picked. Narrowing each step to the children
 * of the last makes the wrong answer unreachable rather than merely discouraged.
 *
 * Each level can also create what it needs on the spot, because being sent to
 * another screen mid-way through writing a product is how half-finished
 * products get abandoned — and how duplicate categories get made by someone who
 * did not want to lose their place.
 */
export function CategoryPicker({
  value,
  onChange,
  onTargetGroupChange,
}: {
  /** The selected category id — always a category or subcategory, never a department. */
  value: string;
  onChange: (categoryId: string) => void;
  /** Fired when the department changes, so the product's audience can follow. */
  onTargetGroupChange?: (group: TargetGroup) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: tree } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<AdminCategoryDto[]>('/admin/categories'),
  });

  const flat = useMemo(() => flatten(tree ?? []), [tree]);
  const selected = flat.find((node) => node.id === value) ?? null;

  /*
   * The category and subcategory are read back out of the saved value, so those
   * two selects can never disagree with what will actually be stored.
   *
   * The department cannot be: between choosing "Women" and choosing a category
   * under it there is nothing saved to derive it from. It therefore gets its
   * own state — but only as a starting point, because once something *is*
   * selected the selection is the authority and this is ignored. That ordering
   * is what stops the picker showing Women's categories under a product filed
   * in Menswear.
   */
  const [pendingDepartmentId, setPendingDepartmentId] = useState<string | null>(null);

  const subcategory = selected?.level === 'subcategory' ? selected : null;
  const category =
    selected?.level === 'category'
      ? selected
      : (flat.find((node) => node.id === subcategory?.parentId) ?? null);

  const departments = (tree ?? []).filter((node) => node.level === 'department');
  const department = category
    ? (flat.find((node) => node.id === category.parentId) ?? null)
    : (departments.find((node) => node.id === pendingDepartmentId) ?? null);
  const categories = department?.children ?? [];
  const subcategories = category?.children ?? [];

  const create = useMutation({
    mutationFn: (input: { name: string; parentId: string | null; targetGroup?: TargetGroup }) =>
      api.post<AdminCategoryDto & { slug: string }>('/admin/categories', {
        name: input.name,
        parentId: input.parentId,
        targetGroup: input.targetGroup,
      }),
    onSuccess: async (created) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      const id = created.id ?? created.slug;
      // A department is a placeholder until something hangs under it, so it
      // becomes the picker's context rather than the product's filing.
      if (created.parentId) onChange(id);
      else {
        setPendingDepartmentId(id);
        onTargetGroupChange?.(created.targetGroup);
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  /**
   * Creating from the picker asks for a name and nothing else. Everything the
   * server needs — level, department, slug, URL fragment — is implied by where
   * it is being created, and asking again would only invite a contradiction.
   */
  const promptCreate = (parent: AdminCategoryDto | null, what: string) => {
    const name = window.prompt(`New ${what}${parent ? ` under ${parent.name}` : ''}`)?.trim();
    if (!name) return;
    const duplicate = (parent?.children ?? departments).find(
      (node) => node.name.toLowerCase() === name.toLowerCase(),
    );
    // Selecting the existing one is what the admin meant; a second "Heels"
    // under the same parent helps nobody.
    if (duplicate) {
      if (duplicate.level !== 'department') onChange(duplicate.id);
      else {
        setPendingDepartmentId(duplicate.id);
        onTargetGroupChange?.(duplicate.targetGroup);
      }
      return;
    }
    create.mutate({ name, parentId: parent?.id ?? null, targetGroup: parent?.targetGroup });
  };

  return (
    <div className="sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Department"
          value={department?.id ?? ''}
          placeholder="Select…"
          options={departments}
          onChange={(id) => {
            const next = departments.find((node) => node.id === id);
            setPendingDepartmentId(id || null);
            onTargetGroupChange?.(next?.targetGroup ?? 'UNISEX');
            // Changing department invalidates the two selections below it.
            onChange('');
          }}
          onCreate={() => promptCreate(null, 'department')}
          testId="product-department"
        />
        <Select
          label="Category"
          value={category?.id ?? ''}
          placeholder={department ? 'Select…' : 'Pick a department first'}
          options={categories}
          disabled={!department}
          onChange={(id) => onChange(id)}
          onCreate={department ? () => promptCreate(department, 'category') : undefined}
          testId="product-category"
        />
        <Select
          label="Subcategory"
          value={subcategory?.id ?? ''}
          placeholder={
            !category ? 'Pick a category first' : subcategories.length ? 'Optional' : 'None yet'
          }
          options={subcategories}
          disabled={!category}
          onChange={(id) => onChange(id || (category?.id ?? ''))}
          onCreate={category ? () => promptCreate(category, 'subcategory') : undefined}
          testId="product-subcategory"
        />
      </div>
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
      {selected ? (
        <p className="mt-1.5 text-xs text-gray-500">
          Filed under <code>{selected.path.join(' / ')}</code>. The product’s audience follows the
          department.
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-500">
          Pick at least a category — products with none drop out of category navigation.
        </p>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
  onCreate,
  testId,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: AdminCategoryDto[];
  disabled?: boolean;
  onChange: (id: string) => void;
  onCreate?: () => void;
  testId: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-baseline justify-between font-medium">
        {label}
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="text-xs font-normal text-gray-500 underline underline-offset-2 hover:text-gray-900"
          >
            + new
          </button>
        ) : null}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className="w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {option.status === 'hidden' ? ' (hidden)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function flatten(nodes: AdminCategoryDto[]): AdminCategoryDto[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}
