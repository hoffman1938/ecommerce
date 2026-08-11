'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ProductEditor from './(panel)/products/[id]/view';

/**
 * Not found — with one rescue.
 *
 * A statically exported panel only has HTML for the products that existed when
 * it was built, so the editor for a product created afterwards has no file and
 * lands here. Everything that page needs is resolved in the browser anyway, so
 * this hands the id straight to the same editor the real route would render.
 *
 * On a deployment with a server behind it this never runs — those routes
 * resolve dynamically.
 */
export default function AdminNotFound() {
  const [productId, setProductId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const index = segments.indexOf('products');
    if (index >= 0 && segments[index + 1] && segments[index + 1] !== 'new') {
      setProductId(segments[index + 1]);
    }
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (productId) return <ProductEditor id={productId} />;

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
