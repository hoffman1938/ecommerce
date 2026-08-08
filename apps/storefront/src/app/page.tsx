import Link from 'next/link';
import type { BrandDto, Paginated, ProductListItemDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from '@/components/product-card';
import { CampaignSections } from '@/components/campaign-sections';

export default async function HomePage() {
  const [brands, newest, bestDiscounts] = await Promise.all([
    serverGet<BrandDto[]>('/catalog/brands'),
    serverGet<Paginated<ProductListItemDto>>('/catalog/products?sort=newest&pageSize=8'),
    serverGet<Paginated<ProductListItemDto>>('/catalog/products?sort=discount&pageSize=8'),
  ]);

  return (
    <div className="space-y-12">
      <section className="rounded-xl bg-gray-900 px-8 py-12 text-white">
        <h1 className="text-3xl font-black sm:text-4xl">Brand outlet deals, up to 60% off</h1>
        <p className="mt-2 max-w-xl text-gray-300">
          Limited stock from Adidas, Nike, Puma, Tommy Hilfiger, Calvin Klein and more. When it’s
          gone, it’s gone — items in your cart are reserved for 20 minutes.
        </p>
        <Link
          href="/campaigns"
          className="mt-6 inline-block rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        >
          Shop active campaigns
        </Link>
      </section>

      {/* Rendered on the client so campaign windows stay live in a static build. */}
      <CampaignSections limit={3} />

      {brands && brands.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-bold">Featured brands</h2>
          <div className="flex flex-wrap gap-3">
            {brands
              .filter((b) => b.isFeatured)
              .map((b) => (
                <Link
                  key={b.id}
                  href={`/brand/${b.slug}`}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:border-gray-900"
                >
                  {b.name}
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      {bestDiscounts ? (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Best discounts</h2>
            <Link href="/products?sort=discount" className="text-sm text-gray-500 hover:underline">
              View all
            </Link>
          </div>
          <ProductGrid products={bestDiscounts.items} />
        </section>
      ) : (
        <p className="text-sm text-gray-500">
          The catalog is empty — is the API running? Try <code>docker compose up --build</code>.
        </p>
      )}

      {newest ? (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Recently added</h2>
            <Link href="/products?sort=newest" className="text-sm text-gray-500 hover:underline">
              View all
            </Link>
          </div>
          <ProductGrid products={newest.items} />
        </section>
      ) : null}
    </div>
  );
}
