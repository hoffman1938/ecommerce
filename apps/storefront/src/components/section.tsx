import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, cx } from '@outlet/ui';

/**
 * Section heading used across the storefront.
 *
 * The rule above the title is what gives long pages their rhythm — it is
 * cheaper visually than wrapping each section in a card, and it keeps every
 * section starting on the same optical line.
 */
export function SectionHeader({
  title,
  description,
  action,
  as: Heading = 'h2',
  className,
}: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div
      className={cx(
        'mb-5 flex items-end justify-between gap-6 border-t border-ink-950 pt-4 lg:mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-2xl font-bold tracking-[-0.025em] text-ink-950 lg:text-3xl">
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-ink-600">{description}</p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-0.5 pb-0.5 text-sm font-medium text-ink-700 transition-colors hover:text-ink-950"
        >
          <span className="hidden sm:inline">{action.label}</span>
          <span className="sm:hidden">All</span>
          <ChevronRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

/** Consistent vertical spacing between top-level page sections. */
export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cx('mt-12 lg:mt-16', className)}>{children}</section>;
}

/**
 * Page-level title block for interior pages (cart, account, content pages).
 * Separate from SectionHeader so h1 treatment stays consistent and is not
 * accidentally reproduced with ad-hoc classes.
 */
export function PageHeader({
  title,
  description,
  meta,
  className,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('border-b border-ink-200 pb-5', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-prose text-sm text-ink-600">{description}</p>
          ) : null}
        </div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>
    </div>
  );
}
