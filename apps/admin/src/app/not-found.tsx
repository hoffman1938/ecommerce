'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** Sections whose detail screens moved from `/<section>/<id>` to `/<section>/view?id=…`. */
const DETAIL_SECTIONS = ['orders', 'products', 'customers', 'returns', 'campaigns'];

/** Sub-paths of those sections that are real pages, not identifiers. */
const RESERVED = ['new', 'view'];

/**
 * Not found — with one redirect.
 *
 * The detail screens used to be dynamic `[id]` segments, which a static export
 * can only serve for ids that existed at build time. They are now
 * `/<section>/view?id=…`, which works for any row. This catches the old shape
 * — a bookmark, a link in an email, a browser autocomplete — and forwards it
 * rather than showing a dead end.
 *
 * Everything is decided from the current path in the browser, so it costs
 * nothing on a deployment where these routes resolve server-side.
 */
export default function AdminNotFound() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const index = segments.findIndex((segment) => DETAIL_SECTIONS.includes(segment));
    const identifier = index >= 0 ? segments[index + 1] : undefined;

    if (identifier && !RESERVED.includes(identifier)) {
      const base = segments.slice(0, index + 1).join('/');
      window.location.replace(`/${base}/view?id=${encodeURIComponent(identifier)}`);
      return;
    }
    setChecked(true);
  }, []);

  // Nothing is rendered until the redirect has been ruled out, so a forwarded
  // URL never flashes a 404 on its way through.
  if (!checked) return null;

  return (
    <div className="p-10 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 text-sm text-gray-500">That screen does not exist in the admin panel.</p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
