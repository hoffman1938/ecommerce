import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import { contentPageKeys } from '@/lib/demo/queries';

/** Pre-render every content page so the app can be exported statically. */
export function generateStaticParams() {
  return contentPageKeys().map((key) => ({ key }));
}

const KNOWN_KEYS = new Set([
  'privacy_policy',
  'terms',
  'cookie_policy',
  'faq',
  'shipping_info',
  'returns_info',
  'contact_info',
]);

export default async function ContentPage({ params }: { params: { key: string } }) {
  if (!KNOWN_KEYS.has(params.key)) notFound();
  const page = await serverGet<{ key: string; title: string; body: string }>(
    `/content/pages/${params.key}`,
  );
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-2xl py-6">
      <h1 className="text-3xl font-bold">{page.title}</h1>
      <div className="prose mt-6 whitespace-pre-line text-gray-700">{page.body}</div>
    </article>
  );
}
