import { AUDIENCES, audienceBySlug } from '@/lib/audience';
import { AudienceListing } from '@/components/audience-listing';

/** Pre-render all four audiences so the app can be exported statically. */
export function generateStaticParams() {
  return AUDIENCES.map((audience) => ({ audience: audience.slug }));
}

export function generateMetadata({ params }: { params: { audience: string } }) {
  const audience = audienceBySlug(params.audience);
  if (!audience) return { title: 'Shop' };
  // Metadata is generated at build time, where there is no active locale, so
  // the title stays in the base language; the page itself translates.
  const label = audience.slug.charAt(0).toUpperCase() + audience.slug.slice(1);
  return { title: label };
}

export default function AudiencePage({ params }: { params: { audience: string } }) {
  return <AudienceListing slug={params.audience} />;
}
