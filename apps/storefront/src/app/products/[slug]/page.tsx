import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ProductDetailDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { productSlugs } from '@/lib/demo/queries';
import { ProductPurchasePanel } from '@/components/product-purchase-panel';
import { RecentlyViewed, TrackProductView } from '@/components/recently-viewed';

/** Pre-render every catalog product so the app can be exported statically. */
export function generateStaticParams() {
  return productSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await serverGet<ProductDetailDto>(`/catalog/products/${params.slug}`);
  if (!product) return { title: 'Product not found' };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
  };
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await serverGet<ProductDetailDto>(`/catalog/products/${params.slug}`);
  if (!product) notFound();

  return (
    <div>
      <TrackProductView slug={product.slug} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0].url}
                alt={product.images[0].altText ?? product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">No image</div>
            )}
          </div>
          {product.images.length > 1 ? (
            <div className="flex gap-2">
              {product.images.slice(1, 5).map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.url}
                  alt={img.altText ?? product.name}
                  className="h-20 w-20 rounded border border-gray-200 object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-semibold uppercase text-gray-500">{product.brand.name}</p>
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
          {product.shortDescription ? (
            <p className="mt-2 text-gray-600">{product.shortDescription}</p>
          ) : null}

          <ProductPurchasePanel product={product} />

          <div className="mt-8 space-y-4 border-t border-gray-200 pt-6 text-sm text-gray-600">
            {product.description ? <p className="whitespace-pre-line">{product.description}</p> : null}
            <dl className="grid grid-cols-2 gap-2">
              {product.materials ? (
                <>
                  <dt className="font-medium text-gray-500">Materials</dt>
                  <dd>{product.materials}</dd>
                </>
              ) : null}
              {product.careInstructions ? (
                <>
                  <dt className="font-medium text-gray-500">Care</dt>
                  <dd>{product.careInstructions}</dd>
                </>
              ) : null}
              {product.countryOfOrigin ? (
                <>
                  <dt className="font-medium text-gray-500">Origin</dt>
                  <dd>{product.countryOfOrigin}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
      <RecentlyViewed excludeSlug={product.slug} />
    </div>
  );
}
