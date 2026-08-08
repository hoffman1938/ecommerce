'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, Skeleton, cx, formatMoney } from '@outlet/ui';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/hooks';
import { PageHeader } from '@/components/section';

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

  if (meLoading) {
    return (
      <div className="container-page py-8 lg:py-12">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!me?.user) {
    return (
      <div className="container-page py-8 lg:py-12">
        <PageHeader title="Your wishlist" />
        <EmptyState
          title="Sign in to see your wishlist"
          description="Saved products stay with your account across devices."
          action={
            <Link
              href="/login?next=/wishlist"
              className="inline-flex h-10 items-center rounded bg-ink-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
            >
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8 lg:py-12">
      <PageHeader
        title="Your wishlist"
        meta={
          items && items.length > 0 ? (
            <span data-numeric className="text-sm text-ink-500">
              {items.length} saved
            </span>
          ) : undefined
        }
      />

      <div className="mt-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[4/5] w-full" />
                <Skeleton className="mt-3 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            description="Tap the heart on any product page to keep it here."
            action={
              <Link
                href="/products"
                className="inline-flex h-10 items-center rounded bg-ink-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
              >
                Browse the outlet
              </Link>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10">
            {items.map((item) => {
              const discounted = item.originalPriceMinor > item.outletPriceMinor;
              return (
                <li key={item.id} className="group relative">
                  <Link
                    href={`/products/${item.slug}`}
                    className="relative block aspect-[4/5] overflow-hidden rounded bg-ink-50"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      />
                    ) : null}
                    <span className="pointer-events-none absolute inset-0 rounded ring-1 ring-inset ring-ink-950/[0.06]" />
                  </Link>

                  <div className="pt-3">
                    <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-500">
                      {item.brandName}
                    </p>
                    <h3 className="mt-1 text-sm font-medium leading-snug text-ink-900">
                      <Link href={`/products/${item.slug}`} className="line-clamp-2 hover:underline">
                        {item.name}
                      </Link>
                    </h3>
                    <p className="mt-1.5 flex items-baseline gap-2">
                      <span
                        data-numeric
                        className={cx(
                          'text-sm font-semibold',
                          discounted ? 'text-sale-500' : 'text-ink-900',
                        )}
                      >
                        {formatMoney(item.outletPriceMinor)}
                      </span>
                      {discounted ? (
                        <span data-numeric className="text-xs text-ink-400 line-through">
                          {formatMoney(item.originalPriceMinor)}
                        </span>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.delete(`/account/wishlist/${item.productId}`);
                        queryClient.invalidateQueries({ queryKey: ['wishlist'] });
                      }}
                      className="relative z-10 mt-2 text-xs text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
