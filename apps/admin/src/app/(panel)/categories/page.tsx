'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCategoryDto, CategoryStatus } from '@outlet/types';
import { Badge, cx } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { CategoryFormDialog, type CategoryFormValues } from '@/components/category-form';
import { DeleteCategoryDialog } from '@/components/category-delete';

/**
 * Catalog → Categories.
 *
 * The whole tree, including the parts a customer cannot see, because this is
 * where those parts are managed. Two very different reasons for invisibility
 * are shown as separate states and never merged:
 *
 *   Hidden  an administrator switched it off. It stays off until they say so.
 *   Empty   it has no available products today. It comes back by itself the
 *           moment one is published into it.
 *
 * Every count is the same figure the storefront computes, so what this screen
 * says about a category is what a shopper actually experiences.
 */
export default function AdminCategoriesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{
    node?: AdminCategoryDto;
    parent?: AdminCategoryDto;
  } | null>(null);
  const [deleting, setDeleting] = useState<AdminCategoryDto | null>(null);

  const { data: tree, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<AdminCategoryDto[]>('/admin/categories'),
  });

  const flat = useMemo(() => flatten(tree ?? []), [tree]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-categories'] });

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : (error as Error).message);

  const visibility = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/categories/${id}/visibility`, { isActive }),
    onSuccess: (_result, { isActive }) => {
      toast.success(isActive ? 'Category is visible again.' : 'Category hidden from the shop.');
      refresh();
    },
    onError: fail,
  });

  const reorder = useMutation({
    mutationFn: ({ parentId, orderedIds }: { parentId: string | null; orderedIds: string[] }) =>
      api.put('/admin/categories/reorder', { parentId, orderedIds }),
    onSuccess: refresh,
    onError: fail,
  });

  const save = useMutation({
    mutationFn: (values: CategoryFormValues & { id?: string }) =>
      values.id
        ? api.put(`/admin/categories/${values.id}`, values)
        : api.post('/admin/categories', values),
    onSuccess: (_result, values) => {
      toast.success(values.id ? 'Category updated.' : 'Category created.');
      setEditing(null);
      refresh();
    },
    onError: fail,
  });

  /**
   * Ordering is a full list rather than a swap, so the result cannot be
   * ambiguous if two moves land close together.
   */
  const nudge = (node: AdminCategoryDto, direction: -1 | 1) => {
    const siblings = siblingsOf(tree ?? [], node);
    const index = siblings.findIndex((sibling) => sibling.id === node.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const ordered = siblings.map((sibling) => sibling.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    reorder.mutate({ parentId: node.parentId, orderedIds: ordered });
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = useMemo(() => visibleRows(tree ?? [], collapsed), [tree, collapsed]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Categories</h1>
        <button
          type="button"
          onClick={() => setEditing({})}
          data-testid="new-category"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          New department
        </button>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-gray-500">
        Department → category → subcategory. A category reaches the storefront only when it is
        active, its parents are active, and it holds at least one available product —{' '}
        <strong>Hidden</strong> is your decision and stays until you reverse it,{' '}
        <strong>Empty</strong> is today’s stock and fixes itself.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th className="text-right">Direct</th>
              <th className="text-right">Total</th>
              <th>Storefront</th>
              <th className="text-right">Order</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-gray-400">
                  No categories yet. Create a department to get started.
                </td>
              </tr>
            ) : (
              rows.map((node) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  collapsed={collapsed.has(node.id)}
                  onToggle={() => toggleCollapse(node.id)}
                  onAddChild={() => setEditing({ parent: node })}
                  onEdit={() => setEditing({ node })}
                  onDelete={() => setDeleting(node)}
                  onMove={(direction) => nudge(node, direction)}
                  onVisibility={() => visibility.mutate({ id: node.id, isActive: !node.isActive })}
                  busy={visibility.isPending || reorder.isPending}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <CategoryFormDialog
          node={editing.node}
          parent={editing.parent}
          categories={flat}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => save.mutate({ ...values, id: editing.node?.id })}
        />
      ) : null}

      {deleting ? (
        <DeleteCategoryDialog
          node={deleting}
          categories={flat}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            toast.success('Category deleted.');
            refresh();
          }}
          onError={fail}
        />
      ) : null}
    </div>
  );
}

function CategoryRow({
  node,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  onMove,
  onVisibility,
  busy,
}: {
  node: AdminCategoryDto;
  collapsed: boolean;
  onToggle: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onVisibility: () => void;
  busy: boolean;
}) {
  const depth = node.path.length - 1;
  const typeLabel =
    node.level === 'department'
      ? 'Department'
      : node.level === 'category'
        ? 'Category'
        : 'Subcategory';

  return (
    <tr data-testid={`category-row-${node.slug}`} className={cx(!node.isActive && 'bg-gray-50')}>
      <td>
        <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 1.25}rem` }}>
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
              className="h-5 w-5 shrink-0 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-900"
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <span className={cx('font-medium', !node.isActive && 'text-gray-500')}>{node.name}</span>
          <code className="ml-1 rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-500">
            {node.slug}
          </code>
        </div>
      </td>
      <td className="text-gray-500">{typeLabel}</td>
      <td>
        <StatusBadge status={node.status} />
      </td>
      <td className="text-right tabular-nums">{node.directProductCount}</td>
      <td className="text-right tabular-nums">{node.productCount}</td>
      <td className="text-gray-500">
        {node.isVisible ? (
          <a
            href={node.href}
            className="text-xs underline underline-offset-2 hover:text-gray-900"
            target="_blank"
            rel="noreferrer"
          >
            {node.href}
          </a>
        ) : (
          <span className="text-xs text-gray-400">not shown</span>
        )}
      </td>
      <td className="text-right">
        <div className="inline-flex gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={busy}
            aria-label={`Move ${node.name} up`}
            className="h-6 w-6 rounded border border-gray-200 text-xs text-gray-500 hover:border-gray-900 hover:text-gray-900 disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={busy}
            aria-label={`Move ${node.name} down`}
            className="h-6 w-6 rounded border border-gray-200 text-xs text-gray-500 hover:border-gray-900 hover:text-gray-900 disabled:opacity-40"
          >
            ↓
          </button>
        </div>
      </td>
      <td className="text-right">
        <div className="inline-flex flex-wrap justify-end gap-1.5 text-xs">
          {node.level !== 'subcategory' ? (
            <button type="button" onClick={onAddChild} className={actionClass}>
              Add child
            </button>
          ) : null}
          <button type="button" onClick={onEdit} className={actionClass}>
            Edit
          </button>
          <button
            type="button"
            onClick={onVisibility}
            disabled={busy}
            data-testid={`toggle-${node.slug}`}
            className={actionClass}
          >
            {node.isActive ? 'Hide' : 'Unhide'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-200 px-2 py-1 text-red-600 hover:border-red-600"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

const actionClass =
  'rounded border border-gray-200 px-2 py-1 text-gray-600 hover:border-gray-900 hover:text-gray-900 disabled:opacity-40';

function StatusBadge({ status }: { status: CategoryStatus }) {
  if (status === 'hidden') return <Badge tone="sale">Hidden</Badge>;
  if (status === 'empty') return <Badge tone="warning">Empty</Badge>;
  return <Badge tone="success">Active</Badge>;
}

// --- Tree helpers ------------------------------------------------------------

function flatten(nodes: AdminCategoryDto[]): AdminCategoryDto[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

/** Depth-first, skipping the children of anything the admin has collapsed. */
function visibleRows(nodes: AdminCategoryDto[], collapsed: Set<string>): AdminCategoryDto[] {
  return nodes.flatMap((node) =>
    collapsed.has(node.id) ? [node] : [node, ...visibleRows(node.children, collapsed)],
  );
}

function siblingsOf(tree: AdminCategoryDto[], node: AdminCategoryDto): AdminCategoryDto[] {
  if (!node.parentId) return tree;
  return flatten(tree).find((candidate) => candidate.id === node.parentId)?.children ?? [];
}
