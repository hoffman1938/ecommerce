import { ProductListing } from '@/components/product-listing';
import { CATEGORIES } from '@/lib/demo/data';

/** Pre-render every catalog category so the app can be exported statically. */
export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

function titleFor(slug: string): string {
  const known = CATEGORIES.find((category) => category.slug === slug);
  if (known) return known.name;
  return slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: titleFor(params.slug) };
}

export default function CategoryPage({ params }: { params: { slug: string } }) {
  return (
    <ProductListing
      title={titleFor(params.slug)}
      fixedFilters={{ category: params.slug }}
      basePath={`/category/${params.slug}`}
    />
  );
}
