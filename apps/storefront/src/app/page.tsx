import Link from 'next/link';
import type { BrandDto, Paginated, ProductListItemDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from '@/components/product-card';
import { CampaignSections } from '@/components/campaign-sections';
import { Section, SectionHeader } from '@/components/section';

/** Service facts, stated once, near the top — not repeated as badges later. */
const PROPOSITIONS = [
  { title: 'Limited stock', body: 'Every deal is real surplus. When a size is gone, it is gone.' },
  { title: 'Held for 20 minutes', body: 'Adding to your bag reserves the item while you decide.' },
  { title: 'Free standard delivery', body: 'On orders over €100. Returns accepted within 30 days.' },
];

export default async function HomePage() {
  const [brands, newest, bestDiscounts] = await Promise.all([
    serverGet<BrandDto[]>('/catalog/brands'),
    serverGet<Paginated<ProductListItemDto>>('/catalog/products?sort=newest&pageSize=8'),
    serverGet<Paginated<ProductListItemDto>>('/catalog/products?sort=discount&pageSize=8'),
  ]);

  return (
    <div className="container-page pb-4">
      {/* Compact editorial intro. The campaigns below are the real hero. */}
      <section className="grid gap-8 border-b border-ink-200 py-10 lg:grid-cols-12 lg:gap-12 lg:py-14">
        <div className="lg:col-span-7">
          <p className="eyebrow">Outlet marketplace</p>
          <h1 className="mt-3 max-w-[13ch] text-4xl font-extrabold leading-[1.04] tracking-[-0.03em] text-ink-950 sm:text-5xl lg:text-6xl">
            Brand deals, up to 60% off.
          </h1>
          <p className="mt-4 max-w-md text-lg text-ink-600">
            Surplus stock from Adidas, Nike, Puma, Tommy Hilfiger and Calvin Klein — released in
            short campaigns and sold until it runs out.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/campaigns"
              className="inline-flex h-11 items-center rounded bg-ink-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
            >
              Shop active campaigns
            </Link>
            <Link
              href="/products?sort=discount"
              className="inline-flex h-11 items-center rounded px-4 text-sm font-semibold text-ink-900 ring-1 ring-inset ring-ink-300 transition-colors hover:bg-ink-25 hover:ring-ink-400"
            >
              Browse best discounts
            </Link>
          </div>
        </div>

        <dl className="grid gap-px self-end overflow-hidden rounded bg-ink-200 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-1">
          {PROPOSITIONS.map((item) => (
            <div key={item.title} className="bg-white px-4 py-3.5">
              <dt className="text-sm font-semibold text-ink-950">{item.title}</dt>
              <dd className="mt-0.5 text-sm leading-snug text-ink-600">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Client-rendered so campaign windows stay live in a static build. */}
      <CampaignSections limit={3} />

      {bestDiscounts && bestDiscounts.items.length > 0 ? (
        <Section>
          <SectionHeader
            title="Best discounts"
            description="The steepest reductions across every brand, right now."
            action={{ href: '/products?sort=discount', label: 'View all' }}
          />
          <ProductGrid products={bestDiscounts.items} priorityCount={4} />
        </Section>
      ) : (
        <Section>
          <p className="border-t border-ink-200 py-16 text-center text-sm text-ink-500">
            The catalog is empty — is the API running? Try <code>docker compose up --build</code>.
          </p>
        </Section>
      )}

      {brands && brands.length > 0 ? (
        <Section>
          <SectionHeader title="Shop by brand" />
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded bg-ink-200 sm:grid-cols-3 lg:grid-cols-6">
            {brands
              .filter((b) => b.isFeatured)
              .map((brand) => (
                <li key={brand.id}>
                  <Link
                    href={`/brand/${brand.slug}`}
                    className="flex h-20 items-center justify-center bg-white px-3 text-center text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-25 hover:text-ink-950"
                  >
                    {brand.name}
                  </Link>
                </li>
              ))}
          </ul>
        </Section>
      ) : null}

      {newest && newest.items.length > 0 ? (
        <Section>
          <SectionHeader
            title="Recently added"
            action={{ href: '/products?sort=newest', label: 'View all' }}
          />
          <ProductGrid products={newest.items} />
        </Section>
      ) : null}
    </div>
  );
}
