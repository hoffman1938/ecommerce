import Link from 'next/link';
import type { ProductListItemDto } from '@outlet/types';
import { formatMoney } from '@outlet/ui';

export function ProductCard({ product }: { product: ProductListItemDto }) {
  const soldOut = product.totalAvailable <= 0;
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
      data-testid="product-card"
    >
      <div className="relative aspect-square bg-gray-100">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No image
          </div>
        )}
        {product.discountPercent > 0 ? (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            -{product.discountPercent}%
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute right-2 top-2 rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
            Sold out
          </span>
        ) : product.totalAvailable <= 3 ? (
          <span className="absolute right-2 top-2 rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
            Only {product.totalAvailable} left
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-xs font-semibold uppercase text-gray-500">{product.brand.name}</p>
        <p className="mt-0.5 line-clamp-2 text-sm font-medium group-hover:underline">
          {product.name}
        </p>
        <p className="mt-auto pt-2 text-sm">
          <span className="font-bold text-red-600">
            {formatMoney(product.currentPriceMinor, product.currencyCode)}
          </span>{' '}
          {product.discountPercent > 0 ? (
            <span className="text-gray-400 line-through">
              {formatMoney(product.originalPriceMinor, product.currencyCode)}
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductListItemDto[] }) {
  if (products.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">No products found.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
