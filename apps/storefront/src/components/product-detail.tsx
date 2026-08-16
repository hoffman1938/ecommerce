/**
 * Product detail, as a component.
 *
 * Rendering lives here rather than in the route because a static export can
 * only pre-render the products that existed at build time. Anything an
 * administrator adds afterwards has no HTML file and lands on not-found,
 * which resolves it in the browser and renders this same component — so the
 * two paths cannot drift into two different-looking product pages.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ProductDetailDto, ProductListItemDto } from '@outlet/types';
import { CategoryName } from '@/components/category-name';
import { ProductDetailTop } from '@/components/product-detail-top';
import { ProductReviews } from '@/components/product-reviews';
import { ProductGrid } from '@/components/product-card';
import { Section, SectionHeader } from '@/components/section';
import { RecentlyViewed, TrackProductView } from '@/components/recently-viewed';
import { breadcrumbJsonLd, productJsonLd } from '@/lib/structured-data';
import { T } from '@/components/t';
import { Breadcrumb } from '@/components/breadcrumb';
/** Specification rows, rendered only for the fields a product actually has. */
function specs(product: ProductDetailDto): Array<[string, ReactNode]> {
  const rows: Array<[string, ReactNode]> = [];
  if (product.materials) rows.push(['ui.materials', product.materials]);
  if (product.careInstructions) rows.push(['ui.care', product.careInstructions]);
  if (product.countryOfOrigin) rows.push(['ui.madeIn', product.countryOfOrigin]);
  if (product.category) {
    rows.push([
      'ui.category',
      <CategoryName key="cat" slug={product.category.slug} name={product.category.name} />,
    ]);
  }
  rows.push(['ui.article', product.variants[0]?.sku.split('-').slice(0, 3).join('-') ?? '—']);
  return rows;
}

export interface ProductDetailProps {
  product: ProductDetailDto;
  related: ProductListItemDto[] | null;
}

/**
 * The product page itself, given its data.
 *
 * Separated from the route so two callers render the identical page: the
 * statically exported route, which fetches at build time, and the client-side
 * fallback in app/not-found.tsx, which fetches in the browser for a product
 * created after the export was built.
 */
export function ProductDetail({ product, related }: ProductDetailProps) {
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

      <Breadcrumb className="mb-6 text-xs text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/products" className="transition-colors hover:text-ink-950">
              <T id="ui.allProducts" />
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
                  <CategoryName slug={product.category.slug} name={product.category.name} />
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </Breadcrumb>

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
                  <T id="ui.aboutThisPiece" />
                </h2>
                <p className="mt-3 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink-600">
                  {product.description}
                </p>
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div>
                <h2 className="text-lg font-bold tracking-[-0.015em] text-ink-950">
                  <T id="ui.productDetails" />
                </h2>
                <dl className="mt-3 divide-y divide-ink-100 dark:divide-line border-t border-ink-100 text-sm">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex gap-4 py-3">
                      <dt className="w-28 shrink-0 text-ink-500">
                        <T id={label} />
                      </dt>
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
            title={<T id="ui.youMayAlsoLike" />}
            description={<T id="ui.similarPiecesFromSameCategory" />}
          />
          <ProductGrid products={related} />
        </Section>
      ) : null}

      <RecentlyViewed excludeSlug={product.slug} />
    </div>
  );
}
