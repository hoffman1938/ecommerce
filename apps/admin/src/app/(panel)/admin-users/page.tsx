'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@outlet/ui';
import { api } from '@/lib/api';
import { T } from '@/components/t';
import { RoleEditor, type RoleEditorTarget } from '@/components/role-editor';

interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: string[];
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleEditorTarget | null>(null);
  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUserRow[]>('/admin/users'),
  });
  const { data: roles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => api.get<RoleRow[]>('/admin/roles'),
  });

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-bold">
        <T id="ui.adminUsersAmpRoles" />
      </h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>
                <T id="ui.status" />
              </th>
              <th>Roles</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((user) => (
              <tr key={user.id}>
                <td>
                  {user.firstName} {user.lastName}
                  <span className="block text-xs text-gray-400">{user.email}</span>
                </td>
                <td>
                  <Badge tone={user.status === 'ACTIVE' ? 'green' : 'red'}>{user.status}</Badge>
                </td>
                <td className="text-xs">{user.roles.join(', ') || '—'}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: user.id,
                        email: user.email,
                        name: `${user.firstName} ${user.lastName}`.trim(),
                        roles: user.roles,
                      })
                    }
                    className="text-xs font-medium text-gray-700 underline hover:text-gray-900"
                  >
                    <T id="ui.editRoles" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">
          <T id="ui.rolePermissionMatrix" />
        </h2>
        <div className="space-y-4 text-sm">
          {(roles ?? []).map((role) => (
            <div key={role.id}>
              <p className="font-medium">{role.name}</p>
              <p className="mt-1 font-mono text-xs text-gray-500">{role.permissions.join(' · ')}</p>
            </div>
          ))}
        </div>
      </section>

      {editing ? (
        <RoleEditor
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setError(null);
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
          }}
        />
      ) : null}
    </div>
  );
}
