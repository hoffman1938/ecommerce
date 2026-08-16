'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  /** Already split by the API — `GROUP_CONCAT` is unpacked before it is sent. */
  permissions: string[];
  userCount: number;
}

export interface RoleEditorTarget {
  id: string;
  email: string;
  name?: string;
  roles: string[];
}

/**
 * Granting and revoking roles.
 *
 * This replaces a `window.prompt` that asked for the role names as a
 * comma-separated string, with the list of valid names printed above the box
 * to copy from. It technically worked; it also meant a typo silently produced
 * "Unknown role", the browser could suppress the dialog outright, and there
 * was nowhere to show what a role actually grants — which is the one thing
 * worth knowing before handing someone Super Admin.
 *
 * The same component serves both screens. An "admin user" here is only a user
 * who holds at least one role, so promoting a customer and editing an
 * administrator are the same operation against the same endpoint, and giving
 * them one editor keeps them that way.
 */
export function RoleEditor({
  target,
  onClose,
  onSaved,
}: {
  target: RoleEditorTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>(target.roles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => api.get<RoleRow[]>('/admin/roles'),
  });

  // Escape closes, as it did for the dialog this replaces.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const toggle = (name: string) =>
    setSelected((current) =>
      current.includes(name) ? current.filter((r) => r !== name) : [...current, name],
    );

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.post(`/admin/users/${target.id}/roles`, { roleNames: selected });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ui.roleChangeFailed'));
    } finally {
      setSaving(false);
    }
  };

  const permissionsOf = (role: RoleRow) => [...(role.permissions ?? [])].sort();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.editRoles')}
      onClick={onClose}
    >
      <div
        // Full-height sheet on a phone, centred card from `sm` up.
        className="flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-w-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold">
            <T id="ui.editRoles" />
          </h2>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {target.name ? `${target.name} · ` : ''}
            {target.email}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {selected.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <T id="ui.noRolesMeansNoAccess" />
            </p>
          ) : null}

          {(roles ?? []).map((role) => {
            const permissions = permissionsOf(role);
            const checked = selected.includes(role.name);
            return (
              <label
                key={role.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  checked ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(role.name)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{role.name}</span>
                    <span className="text-xs text-gray-400">
                      {t('ui.permissionCount', { count: permissions.length })}
                    </span>
                  </span>
                  {role.description ? (
                    <span className="mt-0.5 block text-xs text-gray-500">{role.description}</span>
                  ) : null}
                  {/* What the role actually grants, so the decision is informed
                      rather than a guess from the name. */}
                  <span className="mt-1 block break-words font-mono text-[11px] leading-relaxed text-gray-400">
                    {permissions.slice(0, 8).join(' · ')}
                    {permissions.length > 8 ? ` · +${permissions.length - 8} ${t('ui.more')}` : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {error ? (
          <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <T id="ui.cancel" />
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? t('ui.saving') : t('ui.saveRoles')}
          </button>
        </div>
      </div>
    </div>
  );
}
