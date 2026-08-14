import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ProductDetailDto, ProductListItemDto } from '@outlet/types';
import { serverGet } from '@/lib/server-api';
import { productSlugs } from '@/lib/demo/queries';
import { ProductDetail } from '@/components/product-detail';
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

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const [product, related] = await Promise.all([
    serverGet<ProductDetailDto>(`/catalog/products/${params.slug}`),
    serverGet<ProductListItemDto[]>(`/catalog/products/${params.slug}/related?limit=4`),
  ]);
  if (!product) notFound();

  return <ProductDetail product={product} related={related} />;
}
