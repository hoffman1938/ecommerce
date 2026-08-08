import { ProductListing } from '@/components/product-listing';
import { BRANDS } from '@/lib/demo/data';

/** Pre-render every brand so the app can be exported statically. */
export function generateStaticParams() {
  return BRANDS.map((brand) => ({ slug: brand.slug }));
}

function titleFor(slug: string): string {
  const known = BRANDS.find((brand) => brand.slug === slug);
  if (known) return known.name;
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: titleFor(params.slug) };
}

export default function BrandPage({ params }: { params: { slug: string } }) {
  return (
    <ProductListing
      title={titleFor(params.slug)}
      fixedFilters={{ brand: params.slug }}
      basePath={`/brand/${params.slug}`}
    />
  );
}
