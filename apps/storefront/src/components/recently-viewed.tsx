'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { rememberViewedProduct, recentlyViewedSlugs } from '@/lib/hooks';
import type { ProductDetailDto } from '@outlet/types';
import { formatMoney } from '@outlet/ui';

/** Records a product view in localStorage (client-side only). */
export function TrackProductView({ slug }: { slug: string }) {
  useEffect(() => {
    rememberViewedProduct(slug);
  }, [slug]);
  return null;
}

export function RecentlyViewed({ excludeSlug }: { excludeSlug?: string }) {
  const [products, setProducts] = useState<ProductDetailDto[]>([]);

  useEffect(() => {
    const slugs = recentlyViewedSlugs()
      .filter((s) => s !== excludeSlug)
      .slice(0, 4);
    if (slugs.length === 0) return;
    Promise.all(
      slugs.map((slug) => api.get<ProductDetailDto>(`/catalog/products/${slug}`).catch(() => null)),
    ).then((results) => setProducts(results.filter((p): p is ProductDetailDto => Boolean(p))));
  }, [excludeSlug]);

  if (products.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold">Recently viewed</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.slug}`}
            className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md"
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={p.name} className="aspect-square w-full rounded object-cover" />
            ) : null}
            <p className="mt-2 line-clamp-1 text-sm font-medium">{p.name}</p>
            <p className="text-sm font-bold text-red-600">
              {formatMoney(p.currentPriceMinor, p.currencyCode)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
