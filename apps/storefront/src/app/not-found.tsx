'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@outlet/ui';
import { CategoryListing } from '@/components/category-listing';
import { useI18n } from '@/lib/i18n';

/**
 * Not found — and, for one specific case, a second chance.
 *
 * A statically exported site only has HTML for the paths that existed when it
 * was built, so a category an administrator creates afterwards has no file to
 * serve and lands here. Since the navigation, the tree and the listing are all
 * resolved in the browser anyway, this page can simply finish the job: if the
 * URL looks like a category path, hand it to the same component the real route
 * would have rendered.
 *
 * On any deployment with a server behind it this branch never runs — those
 * routes resolve dynamically and never 404 in the first place.
 */
export default function NotFound() {
  const { t } = useI18n();
  const [path, setPath] = useState<string[] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (segments[0] === 'shop' && segments.length >= 2 && segments.length <= 4) {
      setPath(segments.slice(1));
    }
    setChecked(true);
  }, []);

  // Nothing is rendered until the path has been inspected: flashing "page not
  // found" and then replacing it with the category is worse than a blank beat.
  if (!checked) return null;
  if (path) return <CategoryListing path={path} />;

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
