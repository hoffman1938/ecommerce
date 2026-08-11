import { CATEGORY_NODES, categoryNode, categoryTrail } from '@outlet/catalog';
import { CategoryListing } from '@/components/category-listing';

/**
 * `/shop/women/clothing` — a department's category page.
 *
 * Pre-rendered from the shipped taxonomy so the export has real HTML for every
 * category the shop launches with. Categories created later resolve through the
 * client-side fallback in app/not-found.tsx, and dynamically on any deployment
 * that runs a server.
 */
export function generateStaticParams() {
  return CATEGORY_NODES.filter((node) => node.level === 'category').map((node) => {
    const [department] = categoryTrail(node.slug);
    return { audience: department.pathSegment, category: node.pathSegment };
  });
}

export function generateMetadata({ params }: { params: { audience: string; category: string } }) {
  const node = categoryNode(`${params.audience}-${params.category}`);
  const department = categoryNode(params.audience);
  if (!node || !department) return { title: 'Shop' };
  return { title: `${department.name} ${node.name}` };
}

export default function CategoryPage({
  params,
}: {
  params: { audience: string; category: string };
}) {
  return <CategoryListing path={[params.audience, params.category]} />;
}
