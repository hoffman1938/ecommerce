'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from './api';
import type { CartDto } from '@outlet/types';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  roles: string[];
  permissions: string[];
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: SessionUser | null }>('/auth/me'),
    staleTime: 30_000,
  });
}

export function useCart() {
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => api.get<CartDto>('/cart'),
    // Re-sync with the authoritative server clock regularly; the visible
    // countdown is cosmetic only.
    refetchInterval: 30_000,
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { variantId: string; quantity: number; campaignId?: string | null }) =>
      api.post<CartDto>('/cart/items', input),
    onSuccess: (cart) => queryClient.setQueryData(['cart'], cart),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(['me'], { user: null });
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

// --- Recently viewed (localStorage; purely client-side convenience) ---------

const RECENT_KEY = 'outlet_recently_viewed';

export function rememberViewedProduct(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing: string[] = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    const next = [slug, ...existing.filter((s) => s !== slug)].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — ignore
  }
}

export function recentlyViewedSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}
