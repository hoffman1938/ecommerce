'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * A breadcrumb `<nav>` whose landmark label is translated.
 *
 * Exists because `aria-label` needs a *string*, and the product page that owns
 * this trail is a server component with no locale context to read. Rendering
 * `<T>` inside the label is not an option — an attribute cannot hold an
 * element — so the smallest thing that can be a client component is the nav
 * element itself.
 */
export function Breadcrumb({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('ui.breadcrumb')} className={className}>
      {children}
    </nav>
  );
}
