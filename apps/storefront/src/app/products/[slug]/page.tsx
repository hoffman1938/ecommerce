import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ProductDetailDto, ProductListItemDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { productSlugs } from '@/lib/demo/queries';
import { ProductDetailTop } from '@/components/product-detail-top';
import { ProductReviews } from '@/components/product-reviews';
import { ProductGrid } from '@/components/product-card';
import { Section, SectionHeader } from '@/components/section';
import { RecentlyViewed, TrackProductView } from '@/components/recently-viewed';
import { breadcrumbJsonLd, productJsonLd, SITE_URL } from '@/lib/structured-data';

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

  const title = product.seoTitle ?? product.name;
  const description = product.seoDescription ?? product.shortDescription ?? undefined;
  const path = `/products/${product.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${SITE_URL}${path}`,
      siteName: 'Outlet Marketplace',
    },
    twitter: { card: 'summary_large_image', title, description },
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
  const [product, related] = await Promise.all([
    serverGet<ProductDetailDto>(`/catalog/products/${params.slug}`),
    serverGet<ProductListItemDto[]>(`/catalog/products/${params.slug}/related?limit=4`),
  ]);
  if (!product) notFound();

  const rows = specs(product);
  const trail = [
    { name: 'All products', path: '/products' },
    { name: product.brand.name, path: `/brand/${product.brand.slug}` },
    ...(product.category
      ? [{ name: product.category.name, path: `/category/${product.category.slug}` }]
      : []),
    { name: product.name, path: `/products/${product.slug}` },
  ];

  return (
    // Bottom padding on small screens clears the sticky Add to bag bar, so the
    // last section is never trapped underneath it.
    <div className="container-page py-4 pb-20 lg:py-8 lg:pb-8">
      <TrackProductView
        slug={product.slug}
        productId={product.id}
        brand={product.brand.name}
        priceMinor={product.currentPriceMinor}
      />

      <script
        type="application/ld+json"
        // Server-rendered from our own DTOs, so there is no untrusted input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(trail)) }}
      />

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

      <ProductDetailTop product={product} />

      {/* Long-form content spans the page rather than stacking under the buying
          column, which is what used to leave a column-height void beside the
          sticky gallery. */}
      {product.description || rows.length > 0 ? (
        <section className="mt-10 border-t border-line pt-6 sm:mt-12 lg:mt-20 lg:pt-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
            {product.description ? (
              <div>
                <h2 className="text-lg font-bold tracking-[-0.015em] text-ink-950">
                  About this piece
                </h2>
                <p className="mt-3 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink-600">
                  {product.description}
                </p>
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div>
                <h2 className="text-lg font-bold tracking-[-0.015em] text-ink-950">
                  Product details
                </h2>
                <dl className="mt-3 divide-y divide-ink-100 dark:divide-line border-t border-ink-100 text-sm">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex gap-4 py-3">
                      <dt className="w-28 shrink-0 text-ink-500">{label}</dt>
                      <dd className="min-w-0 text-ink-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <ProductReviews
        slug={product.slug}
        ratingAverage={product.ratingAverage}
        reviewCount={product.reviewCount}
      />

      {related && related.length > 0 ? (
        <Section className="reveal">
          <SectionHeader
            title="You may also like"
            description="Similar pieces from the same category and brands."
          />
          <ProductGrid products={related} />
        </Section>
      ) : null}

      <RecentlyViewed excludeSlug={product.slug} />
    </div>
  );
}
