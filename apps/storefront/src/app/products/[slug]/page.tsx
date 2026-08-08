import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ProductDetailDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { productSlugs } from '@/lib/demo/queries';
import { ProductPurchasePanel } from '@/components/product-purchase-panel';
import { ProductGallery } from '@/components/product-gallery';
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

/** Specification rows, rendered only for the fields a product actually has. */
function specs(product: ProductDetailDto): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (product.materials) rows.push(['Materials', product.materials]);
  if (product.careInstructions) rows.push(['Care', product.careInstructions]);
  if (product.countryOfOrigin) rows.push(['Made in', product.countryOfOrigin]);
  if (product.category) rows.push(['Category', product.category.name]);
  rows.push(['Article', product.variants[0]?.sku.split('-').slice(0, 3).join('-') ?? '—']);
  return rows;
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await serverGet<ProductDetailDto>(`/catalog/products/${params.slug}`);
  if (!product) notFound();

  const rows = specs(product);

  return (
    <div className="container-page py-5 lg:py-8">
      <TrackProductView slug={product.slug} />

      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/products" className="transition-colors hover:text-ink-950">
              All products
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/brand/${product.brand.slug}`}
              className="transition-colors hover:text-ink-950"
            >
              {product.brand.name}
            </Link>
          </li>
          {product.category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/category/${product.category.slug}`}
                  className="transition-colors hover:text-ink-950"
                >
                  {product.category.name}
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <ProductGallery images={product.images} productName={product.name} />
        </div>

        <div className="min-w-0">
          <Link
            href={`/brand/${product.brand.slug}`}
            className="eyebrow transition-colors hover:text-ink-950"
          >
            {product.brand.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">
            {product.name}
          </h1>
          {product.shortDescription ? (
            <p className="mt-2.5 text-base text-ink-600">{product.shortDescription}</p>
          ) : null}

          <div className="mt-7 border-t border-ink-200 pt-7">
            <ProductPurchasePanel product={product} />
          </div>

          {product.description ? (
            <section className="mt-10 border-t border-ink-200 pt-7">
              <h2 className="text-sm font-semibold text-ink-950">Description</h2>
              <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                {product.description}
              </p>
            </section>
          ) : null}

          {rows.length > 0 ? (
            <section className="mt-8 border-t border-ink-200 pt-7">
              <h2 className="text-sm font-semibold text-ink-950">Details</h2>
              <dl className="mt-3 divide-y divide-ink-100 text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex gap-4 py-2.5">
                    <dt className="w-32 shrink-0 text-ink-500">{label}</dt>
                    <dd className="min-w-0 text-ink-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>

      <RecentlyViewed excludeSlug={product.slug} />
    </div>
  );
}
