'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@outlet/ui';
import { CategoryListing } from '@/components/category-listing';
import { ProductDetailRemote } from '@/components/product-detail-remote';
import { useI18n } from '@/lib/i18n';

/**
 * Not found — and, for two specific cases, a second chance.
 *
 * A statically exported site only has HTML for the paths that existed when it
 * was built, so a category or a product an administrator creates afterwards
 * has no file to serve and lands here. Everything those pages need is resolved
 * in the browser anyway, so this page finishes the job: if the URL looks like
 * one of them, it is handed to the same component the real route would have
 * rendered.
 *
 * On any deployment with a server behind it neither branch runs — those routes
 * resolve dynamically and never 404 in the first place.
 */
export default function NotFound() {
  const { t } = useI18n();
  const [path, setPath] = useState<string[] | null>(null);
  const [productSlug, setProductSlug] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (segments[0] === 'shop' && segments.length >= 2 && segments.length <= 4) {
      setPath(segments.slice(1));
    } else if (segments[0] === 'products' && segments.length === 2) {
      setProductSlug(decodeURIComponent(segments[1]));
    }
    setChecked(true);
  }, []);

  // Nothing is rendered until the path has been inspected: flashing "page not
  // found" and then replacing it with the real page is worse than a blank beat.
  if (!checked) return null;
  if (path) return <CategoryListing path={path} />;
  if (productSlug) return <ProductDetailRemote slug={productSlug} />;

  return (
    <div className="container-page py-20">
      <EmptyState
        title={t('common.notFoundTitle')}
        description={t('common.notFoundDesc')}
        action={
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            {t('common.backHome')}
          </Link>
        }
      />
    </div>
  );
}
