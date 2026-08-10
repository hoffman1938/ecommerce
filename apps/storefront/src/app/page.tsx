import Link from 'next/link';
import type { BrandDto, CategoryDto, Paginated, ProductListItemDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from '@/components/product-card';
import { CampaignSections } from '@/components/campaign-sections';
import { CategoryTiles } from '@/components/category-tiles';
import { Recommendations } from '@/components/recommendations';
import { Section, SectionHeader } from '@/components/section';
import { T } from '@/components/t';

export default async function HomePage() {
  const PROPOSITIONS = [
    ['01', <T key="p1t" id="home.prop1Title" />, <T key="p1b" id="home.prop1Body" />],
    ['02', <T key="p2t" id="home.prop2Title" />, <T key="p2b" id="home.prop2Body" />],
    ['03', <T key="p3t" id="home.prop3Title" />, <T key="p3b" id="home.prop3Body" />],
  ];

  const [brands, categories, newest, bestDiscounts] = await Promise.all([
    serverGet<BrandDto[]>('/catalog/brands'),
    serverGet<CategoryDto[]>('/catalog/categories'),
    serverGet<Paginated<ProductListItemDto>>('/catalog/products?sort=newest&pageSize=8'),
    serverGet<Paginated<ProductListItemDto>>('/catalog/products?sort=discount&pageSize=8'),
  ]);

  const featured = (brands ?? []).filter((b) => b.isFeatured);

  return (
    <>
      {/* Editorial masthead. Type is the image here — the campaign artwork
          immediately below carries the photography, so competing with it would
          only crowd the fold. */}
      <section className="masthead-wash container-page">
        <div className="grid items-end gap-8 border-b border-line pb-8 pt-8 lg:grid-cols-12 lg:pb-14 lg:pt-16 dark:lg:pb-16 dark:lg:pt-20">
          <div className="lg:col-span-8">
            <p className="eyebrow">
              <T id="home.eyebrow" />
            </p>
            <h1 className="display mt-5 whitespace-pre-line text-5xl sm:text-7xl lg:text-8xl">
              <T id="home.headline" />
            </h1>
          </div>

          <div className="lg:col-span-4 lg:pb-2">
            <p className="max-w-sm text-lg text-ink-600">
              <T id="home.description" />
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/campaigns"
                className="group inline-flex h-12 items-center gap-2 rounded-none bg-accent px-7 text-sm font-semibold uppercase tracking-[0.06em] text-accent-contrast transition-colors duration-150 hover:bg-accent-hover"
              >
                <T id="home.shopCampaigns" />
                <span className="transition-transform duration-300 ease-out group-hover:translate-x-1">
                  →
                </span>
              </Link>
              <Link
                href="/products?sort=discount"
                className="inline-flex h-12 items-center px-1 text-sm font-semibold uppercase tracking-[0.06em] text-ink-950"
              >
                <span className="link-underline">
                  <T id="home.bestDiscounts" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Brand ticker. A quiet editorial device, not a headline — small type,
          slow, and stopped entirely under reduced-motion. */}
      {featured.length > 0 ? (
        <div className="overflow-hidden border-b border-line py-3">
          <div className="flex w-max animate-marquee gap-10 pr-10 motion-reduce:animate-none">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center gap-10" aria-hidden={copy === 1}>
                {featured.map((brand) => (
                  <li key={brand.id}>
                    <Link
                      href={`/brand/${brand.slug}`}
                      className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-400 transition-colors hover:text-ink-950"
                      tabIndex={copy === 1 ? -1 : undefined}
                    >
                      {brand.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ) : null}

      <div className="container-page pb-8">
        {/* Category navigation sits directly under the fold: visitors who
            arrive without a product in mind need somewhere to go before they
            need a deal, and recognising a garment is faster than reading a
            nav label. */}
        {categories && categories.length > 0 ? (
          <Section className="reveal">
            <SectionHeader
              title="Shop by category"
              description="Everything in the outlet, sorted the way you would ask for it."
            />
            <CategoryTiles categories={categories.slice(0, 8)} />
          </Section>
        ) : null}

        <CampaignSections limit={3} />

        {bestDiscounts && bestDiscounts.items.length > 0 ? (
          <Section className="reveal">
            <SectionHeader
              title={<T id="product.bestDiscounts" />}
              description={<T id="product.bestDiscountsDesc" />}
              action={{ href: '/products?sort=discount', label: <T id="product.viewAll" /> }}
            />
            <ProductGrid products={bestDiscounts.items} priorityCount={4} />
          </Section>
        ) : (
          <Section>
            <p className="border-t border-line py-10 text-center lg:py-16 text-sm text-ink-500">
              <T id="product.noCatalog" />
            </p>
          </Section>
        )}

        {/* Asymmetric editorial block: a standing statement beside the brand
            index, rather than another even grid of tiles. */}
        {featured.length > 0 ? (
          <Section className="reveal">
            <div className="grid gap-8 border-t border-ink-950 pt-4 dark:border-ink-700 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-4">
                <h2 className="text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">
                  <T id="home.theBrands" />
                </h2>
                <p className="mt-2 max-w-xs text-sm text-ink-600">
                  <T id="home.brandsDesc" />
                </p>
              </div>
              <ul className="lg:col-span-8">
                {featured.map((brand) => (
                  <li key={brand.id} className="border-b border-line first:border-t">
                    <Link
                      href={`/brand/${brand.slug}`}
                      className="group flex items-baseline justify-between gap-6 py-5 lg:py-6"
                    >
                      <span className="text-2xl font-bold tracking-[-0.02em] text-ink-950 transition-transform duration-300 ease-out group-hover:translate-x-1.5 lg:text-3xl">
                        {brand.name}
                      </span>
                      <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400 transition-colors group-hover:text-ink-950">
                        <T id="home.shop" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        ) : null}

        {newest && newest.items.length > 0 ? (
          <Section className="reveal">
            <SectionHeader
              title={<T id="product.recentlyAdded" />}
              action={{ href: '/products?sort=newest', label: <T id="product.viewAll" /> }}
            />
            <ProductGrid products={newest.items} />
          </Section>
        ) : null}

        {/* Renders nothing until this browser has viewed something, so a first
            visit is not padded with a section that is really just "more
            products". */}
        <Recommendations
          title="Picked for you"
          description="Based on what you have been looking at in this browser."
        />

        {/* Service facts, numbered. Stated once, low on the page, where they
            answer a question rather than interrupt the offer. */}
        <Section className="reveal">
          {/* `gap-px` over a background is what draws the rules between cells,
              so the wrapper colour is a divider, not a surface. */}
          <dl className="grid gap-px border-t border-ink-950 bg-ink-200 pt-px dark:border-ink-700 dark:bg-line-strong sm:grid-cols-3">
            {PROPOSITIONS.map(([index, title, body]) => (
              <div key={index as string} className="bg-ink-25 py-6 dark:bg-surface sm:px-5 sm:first:pl-0">
                <span className="eyebrow">{index as string}</span>
                <dt className="mt-2 text-base font-semibold text-ink-950">{title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-600">{body}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </>
  );
}
