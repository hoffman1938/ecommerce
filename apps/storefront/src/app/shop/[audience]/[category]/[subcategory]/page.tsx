import { CATEGORY_NODES, categoryNode, categoryTrail } from '@outlet/catalog';
import { CategoryListing } from '@/components/category-listing';

/** `/shop/women/clothing/dresses` — the leaf of the tree. */
export function generateStaticParams() {
  return CATEGORY_NODES.filter((node) => node.level === 'subcategory').map((node) => {
    const [department, category] = categoryTrail(node.slug);
    return {
      audience: department.pathSegment,
      category: category.pathSegment,
      subcategory: node.pathSegment,
    };
  });
}

export function generateMetadata({
  params,
}: {
  params: { audience: string; subcategory: string };
}) {
  const node = categoryNode(`${params.audience}-${params.subcategory}`);
  const department = categoryNode(params.audience);
  if (!node || !department) return { title: 'Shop' };
  return { title: `${department.name} ${node.name}` };
}

export default function SubcategoryPage({
  params,
}: {
  params: { audience: string; category: string; subcategory: string };
}) {
  return <CategoryListing path={[params.audience, params.category, params.subcategory]} />;
}
