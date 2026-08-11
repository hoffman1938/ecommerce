'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import type { AdminCategoryDto } from '@outlet/types';
import { Button } from '@outlet/ui';
import { api } from '@/lib/api';

/**
 * Deleting a category, with the products accounted for.
 *
 * The dialog will not let the administrator through without stating where the
 * products go. That is deliberate friction: orphaned products are invisible
 * damage — nothing breaks, nothing errors, and months later a chunk of the
 * catalogue is simply unreachable from the navigation.
 *
 * Subcategories are promoted to the deleted row's parent by default rather than
 * deleted with it, because losing a whole branch to one mis-click is the more
 * expensive mistake of the two.
 */
export function DeleteCategoryDialog({
  node,
  categories,
  onClose,
  onDeleted,
  onError,
}: {
  node: AdminCategoryDto;
  categories: AdminCategoryDto[];
  onClose: () => void;
  onDeleted: () => void;
  onError: (error: unknown) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [childStrategy, setChildStrategy] = useState<'promote' | 'cascade'>('promote');
  const [strategy, setStrategy] = useState<'reassign' | 'detach'>('reassign');
  const [targetCategoryId, setTargetCategoryId] = useState('');

  const branch = childStrategy === 'cascade' ? descendants(node) : [node];
  const branchIds = new Set(branch.map((row) => row.id));
  const affectedProducts = branch.reduce((sum, row) => sum + row.totalProductCount, 0);
  const childCount = descendants(node).length - 1;

  // Anything not being deleted, and not a department — a product belongs in a
  // category, not in "Women".
  const destinations = categories.filter(
    (candidate) => !branchIds.has(candidate.id) && candidate.level !== 'department',
  );

  const remove = useMutation({
    mutationFn: () =>
      api.post(`/admin/categories/${node.id}/delete`, {
        strategy: affectedProducts > 0 ? strategy : 'detach',
        targetCategoryId: targetCategoryId || null,
        childStrategy,
      }),
    onSuccess: onDeleted,
    onError,
  });

  if (!mounted) return null;

  const blocked = affectedProducts > 0 && strategy === 'reassign' && !targetCategoryId;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => !remove.isPending && onClose()}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-gray-900">Delete “{node.name}”</h2>

        <div className="mt-3 space-y-3 text-sm text-gray-600">
          {childCount > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="font-medium text-amber-900">
                {childCount} subcategor{childCount === 1 ? 'y' : 'ies'} sit under this one.
              </p>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={childStrategy === 'promote'}
                  onChange={() => setChildStrategy('promote')}
                />
                <span>
                  Keep them, moved up one level
                  <span className="block text-xs text-amber-800">Recommended.</span>
                </span>
              </label>
              <label className="mt-1.5 flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={childStrategy === 'cascade'}
                  onChange={() => setChildStrategy('cascade')}
                />
                <span>Delete the whole branch</span>
              </label>
            </div>
          ) : null}

          {affectedProducts > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="font-medium text-red-900" data-testid="delete-product-count">
                {affectedProducts === 1
                  ? '1 product is filed here.'
                  : `${affectedProducts} products are filed here.`}
              </p>
              <p className="mt-0.5 text-xs text-red-800">
                They will not be deleted — but they need somewhere to go.
              </p>

              <label className="mt-2 flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={strategy === 'reassign'}
                  onChange={() => setStrategy('reassign')}
                />
                <span className="flex-1">
                  Move them to another category
                  <select
                    value={targetCategoryId}
                    onChange={(event) => {
                      setStrategy('reassign');
                      setTargetCategoryId(event.target.value);
                    }}
                    data-testid="reassign-target"
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Choose a category…</option>
                    {destinations.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.path.join(' / ')}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              <label className="mt-2 flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={strategy === 'detach'}
                  onChange={() => setStrategy('detach')}
                />
                <span>
                  Leave them uncategorised
                  <span className="block text-xs text-red-800">
                    They stay in their department’s listing and in search, but drop out of category
                    navigation until they are re-filed.
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <p>This category holds no products. Deleting it affects nothing else.</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={blocked || remove.isPending}
            data-testid="confirm-delete-category"
            className="inline-flex h-10 items-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {remove.isPending ? 'Deleting…' : 'Delete category'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function descendants(node: AdminCategoryDto): AdminCategoryDto[] {
  return [node, ...node.children.flatMap(descendants)];
}
