'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface AdminSessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}

export function useAdminUser() {
  return useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api.get<{ user: AdminSessionUser | null }>('/auth/me'),
    staleTime: 30_000,
  });
}

export function hasPermission(
  user: AdminSessionUser | null | undefined,
  permission: string,
): boolean {
  return Boolean(user?.permissions.includes(permission));
}
