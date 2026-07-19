'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@outlet/ui';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/hooks';

interface WishlistItem {
  id: string;
  productId: string;
  name: string;
  slug: string;
  brandName: string;
  imageUrl: string | null;
  outletPriceMinor: number;
  originalPriceMinor: number;
}

export default function WishlistPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api.get<WishlistItem[]>('/account/wishlist'),
    enabled: Boolean(me?.user),
  });

  if (meLoading) return <p className="py-10 text-center text-gray-500">Loading…</p>;
  if (!me?.user) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Your wishlist</h1>
        <p className="mt-2 text-gray-500">Sign in to save products for later.</p>
        <Link href="/login?next=/wishlist" className="mt-6 inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Your wishlist</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !items || items.length === 0 ? (
        <p className="text-gray-500">Nothing saved yet. Tap the ♥ on any product page.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <Link href={`/products/${item.slug}`}>
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="aspect-square w-full rounded object-cover" />
                ) : (
                  <div className="aspect-square rounded bg-gray-100" />
                )}
                <p className="mt-2 text-xs font-semibold uppercase text-gray-500">{item.brandName}</p>
                <p className="line-clamp-1 text-sm font-medium hover:underline">{item.name}</p>
              </Link>
              <p className="mt-1 text-sm font-bold text-red-600">
                {formatMoney(item.outletPriceMinor)}
                <span className="ml-1 font-normal text-gray-400 line-through">
                  {formatMoney(item.originalPriceMinor)}
                </span>
              </p>
              <button
                type="button"
                onClick={async () => {
                  await api.delete(`/account/wishlist/${item.productId}`);
                  queryClient.invalidateQueries({ queryKey: ['wishlist'] });
                }}
                className="mt-2 text-xs text-gray-500 underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
