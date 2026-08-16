'use client';

import { useCategorySlugLabel } from '@/lib/categories';

/**
 * A category's name, translated, for server-rendered callers.
 *
 * The product page is a server component — it has to be, so the static export
 * can pre-render one HTML file per product — and cannot call the locale hook
 * itself. This is the same escape hatch `<T>` provides for plain copy.
 */
export function CategoryName({ slug, name }: { slug: string; name: string }) {
  const label = useCategorySlugLabel();
  return <>{label({ slug, name })}</>;
}
