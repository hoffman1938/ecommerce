'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from './api';
import { track } from './analytics';
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

interface WishlistEntry {
  productId: string;
}

/**
 * Wishlist membership plus a toggle, for the save control on listing tiles.
 *
 * The list is only fetched once someone is signed in — an anonymous visitor has
 * no wishlist to be in, and firing a 401 per grid render to discover that is
 * pure noise. Saving while signed out sends them to sign-in with a `next` back
 * to where they were, rather than silently doing nothing.
 */
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const { data: me } = useCurrentUser();
  const signedIn = Boolean(me?.user);

  const { data } = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api.get<WishlistEntry[]>('/account/wishlist'),
    enabled: signedIn,
    staleTime: 30_000,
  });

  const ids = useMemo(() => new Set((data ?? []).map((entry) => entry.productId)), [data]);

  const mutation = useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) => {
      if (saved) await api.delete(`/account/wishlist/${productId}`);
      else await api.post('/account/wishlist', { productId });
      return { productId, saved };
    },
    onSuccess: ({ productId, saved }) => {
      track(saved ? 'wishlist_remove' : 'wishlist_add', { productId });
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  return {
    contains: (productId: string) => ids.has(productId),
    toggle: (productId: string) => {
      if (!signedIn) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      mutation.mutate({ productId, saved: ids.has(productId) });
    },
    isPending: mutation.isPending,
  };
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
