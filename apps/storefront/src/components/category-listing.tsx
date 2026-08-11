'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import type { CategoryDto } from '@outlet/types';
import { EmptyState, cx } from '@outlet/ui';
import { flattenCategories, useCategoryTree } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';
import { Breadcrumb } from './breadcrumb';
import { ProductListing } from './product-listing';
import { ProductGridSkeleton } from './product-card';
import { T } from '@/components/t';

/**
 * A department, category or subcategory page.
 *
 * One component covers all three levels, because to a shopper they differ only
 * in how deep they are: the products shown are always "this node and everything
 * beneath it", and the only other thing that changes is which links to offer
 * next.
 *
 * Resolution happens against the navigation tree the header is already
 * fetching, rather than a second request. That is not only cheaper — it
 * guarantees a category the menu no longer offers cannot still have a page,
 * because both are reading the same answer to "what is visible".
 */
export function CategoryListing({ path, slug }: { path?: string[]; slug?: string }) {
  const { t } = useI18n();
  const { data: tree, isPending } = useCategoryTree();

  const trail = resolveTrail(tree ?? [], { path, slug });
  const node = trail[trail.length - 1];

  if (isPending) {
    return (
      <div className="container-page py-6 lg:py-10">
        <div className="border-b border-line pb-6">
          <div className="h-10 w-56 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="pt-8">
          <ProductGridSkeleton count={12} />
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title={t('category.notFound')}
          description={t('category.notFoundDesc')}
          action={
            <Link
              href="/products"
              className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
            >
              {t('nav.allProducts')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <ProductListing
      title={node.name}
      basePath={node.href}
      fixedFilters={{ category: node.slug }}
      audience={node.targetGroup}
      breadcrumbs={<CategoryTrail trail={trail} />}
      subNav={<CategoryChips node={node} tree={tree ?? []} />}
    />
  );
}

/**
 * Walks the tree to the requested node.
 *
 * Both addressing schemes land here: the readable path from `/shop/...` and the
 * bare slug from `/category/:slug`, which product breadcrumbs and search
 * suggestions still use.
 */
function resolveTrail(
  tree: CategoryDto[],
  target: { path?: string[]; slug?: string },
): CategoryDto[] {
  if (target.slug) {
    const match = flattenCategories(tree).find((node) => node.slug === target.slug);
    return match ? resolveTrail(tree, { path: match.path }) : [];
  }
  const segments = target.path ?? [];
  if (segments.length === 0) return [];

  const trail: CategoryDto[] = [];
  let level = tree;
  for (const segment of segments) {
    const match = level.find((node) => node.pathSegment === segment);
    if (!match) return [];
    trail.push(match);
    level = match.children;
  }
  return trail;
}

function CategoryTrail({ trail }: { trail: CategoryDto[] }) {
  return (
    <Breadcrumb className="mb-4 text-xs text-ink-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/products" className="transition-colors hover:text-ink-950">
            <T id="ui.allProducts" />
          </Link>
        </li>
        {trail.map((node, index) => (
          <Fragment key={node.id}>
            <li aria-hidden="true">/</li>
            <li>
              {index === trail.length - 1 ? (
                <span className="text-ink-800">{node.name}</span>
              ) : (
                <Link href={node.href} className="transition-colors hover:text-ink-950">
                  {node.name}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </Breadcrumb>
  );
}

/**
 * Where to go next from here.
 *
 * A subcategory has no children, so it offers its siblings instead — someone
 * looking at Heels who wants Flats should not have to climb two levels to find
 * them.
 */
function CategoryChips({ node, tree }: { node: CategoryDto; tree: CategoryDto[] }) {
  const siblings =
    node.children.length > 0
      ? node.children
      : (flattenCategories(tree).find((candidate) => candidate.id === node.parentId)?.children ??
        []);

  if (siblings.length === 0) return null;

  return (
    <nav
      aria-label={node.name}
      className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {siblings.map((child) => (
        <Link
          key={child.id}
          href={child.href}
          aria-current={child.id === node.id ? 'page' : undefined}
          className={cx(
            'inline-flex h-9 shrink-0 items-center rounded px-3.5 text-sm font-medium transition-colors duration-150',
            child.id === node.id
              ? 'bg-ink-950 text-ink-25'
              : 'text-ink-800 ring-1 ring-inset ring-ink-300 hover:bg-ink-50 hover:text-ink-950 dark:bg-surface-card dark:text-content-secondary dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:text-ink-950',
          )}
        >
          {child.name}
          <span data-numeric className="ml-1.5 text-xs opacity-60">
            {child.productCount}
          </span>
        </Link>
      ))}
    </nav>
  );
}
