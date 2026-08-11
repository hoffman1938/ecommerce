import { CATEGORY_NODES, categoryNode, categoryTrail } from '@outlet/catalog';
import { CategoryListing } from '@/components/category-listing';

/**
 * `/category/:slug` — the slug-addressed entry point.
 *
 * Superseded by the readable `/shop/women/clothing/dresses` paths, but kept
 * working because product breadcrumbs, search suggestions and any link a
 * customer has already saved point here. It resolves the slug against the same
 * tree and renders the same page, so there is one implementation rather than
 * two.
 */
export function generateStaticParams() {
  return CATEGORY_NODES.map((node) => ({ slug: node.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const node = categoryNode(params.slug);
  if (!node) return { title: params.slug.replace(/-/g, ' ') };
  const [department] = categoryTrail(node.slug);
  return {
    title: department.slug === node.slug ? node.name : `${department.name} ${node.name}`,
  };
}

export default function CategoryBySlugPage({ params }: { params: { slug: string } }) {
  // Resolved by slug rather than by path, so a category created after this
  // build still lands on the right page.
  return <CategoryListing slug={params.slug} />;
}
