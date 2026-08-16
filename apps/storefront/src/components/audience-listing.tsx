'use client';

import Link from 'next/link';
import type { CategoryDto } from '@outlet/types';
import { EmptyState, cx } from '@outlet/ui';
import { audienceBySlug } from '@/lib/audience';
import { departmentFor, useCategoryLabel, useCategoryTree } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';
import { ProductListing } from './product-listing';

/**
 * A Men / Women / Kids / Unisex department page.
 *
 * Products are still selected by `targetGroup` rather than by the department's
 * category subtree, deliberately: a product whose category was deleted, or that
 * has not been filed into one yet, still belongs in its department's listing
 * and would otherwise silently vanish from the shop.
 *
 * What the tree provides is the way down — the department's categories, with
 * live counts, only for the ones a customer can currently reach.
 */
export function AudienceListing({ slug }: { slug: string }) {
  const { t } = useI18n();
  const audience = audienceBySlug(slug);
  const { data: tree } = useCategoryTree();

  if (!audience) {
    return (
      <div className="container-page">
        <EmptyState title={t('audience.notFound')} description={t('audience.notFoundDesc')} />
      </div>
    );
  }

  const department = departmentFor(tree, audience.group);

  return (
    <ProductListing
      title={t(`audience.${audience.key}`)}
      fixedFilters={{ targetGroup: audience.group }}
      basePath={`/shop/${audience.slug}`}
      audience={audience.group}
      subNav={department ? <DepartmentNav department={department} /> : null}
    />
  );
}

/**
 * The department's categories and, beneath each, its subcategories.
 *
 * Two levels at once rather than a drill-down: on a department page the
 * shopper's next click is almost always a garment type, and making them stop at
 * "Clothing" first adds a page load to every journey.
 */
function DepartmentNav({ department }: { department: CategoryDto }) {
  const label = useCategoryLabel();
  if (department.children.length === 0) return null;

  return (
    <nav aria-label={label(department)} className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {department.children.map((category) => (
        <div key={category.id}>
          <Link
            href={category.href}
            className="text-sm font-semibold text-ink-950 transition-colors hover:text-accent"
          >
            {label(category)}
            <span data-numeric className="ml-1.5 text-xs font-normal text-ink-500">
              {category.productCount}
            </span>
          </Link>
          {category.children.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
              {category.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={child.href}
                    className={cx(
                      'text-sm text-ink-600 transition-colors hover:text-ink-950',
                      'dark:text-content-secondary dark:hover:text-ink-950',
                    )}
                  >
                    {label(child)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
