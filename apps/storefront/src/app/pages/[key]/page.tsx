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

type ContentPage = { key: string; title: string; body: string };

export async function generateMetadata({ params }: { params: { key: string } }) {
  const page = await serverGet<ContentPage>(`/content/pages/${params.key}`);
  return { title: page?.title ?? 'Page' };
}

export default async function ContentPage({ params }: { params: { key: string } }) {
  if (!KNOWN_KEYS.has(params.key)) notFound();
  const page = await serverGet<ContentPage>(`/content/pages/${params.key}`);
  if (!page) notFound();

  return (
    <div className="container-page py-8 lg:py-16">
      {/* Measured column: long-form copy should not run the full page width. */}
      <article className="mx-auto max-w-prose">
        <h1 className="text-3xl font-bold tracking-[-0.025em] text-ink-950 lg:text-4xl">
          {page.title}
        </h1>
        <div className="mt-6 space-y-4 border-t border-line pt-6 text-base leading-relaxed text-ink-700 lg:mt-8 lg:pt-8">
          {page.body.split('\n\n').map((paragraph, i) => (
            <p key={i} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
}
