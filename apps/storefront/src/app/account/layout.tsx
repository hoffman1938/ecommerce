'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton, cx } from '@outlet/ui';
import { useCurrentUser, useLogout } from '@/lib/hooks';

const NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/returns', label: 'Returns & refunds' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/profile', label: 'Personal information' },
  { href: '/account/security', label: 'Password & security' },
  { href: '/account/inbox', label: 'Notifications & inbox' },
  { href: '/account/notifications', label: 'Notification settings' },
  { href: '/wishlist', label: 'Wishlist' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, isLoading } = useCurrentUser();
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading && !me?.user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, me?.user, pathname, router]);

  if (isLoading || !me?.user) {
    return (
      <div className="container-page py-6 lg:py-10">
        <Skeleton className="h-8 w-48" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 lg:py-12">
      <div className="border-b border-line pb-5">
        <p className="eyebrow">Your account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-ink-950 lg:text-3xl">
          {me.user.firstName} {me.user.lastName}
        </h1>
        <p className="mt-1 text-sm text-ink-500">{me.user.email}</p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
        {/* Horizontal, scrollable tab rail on small screens; vertical list on
            desktop. Both use the same source list and active treatment. */}
        {/* `min-w-0` is load-bearing: a grid item defaults to a min-content
            width, so without it the column stretched to fit the whole tab rail
            (1107px) instead of letting the rail scroll inside it, and every
            sibling — heading, panels — inherited that width and pushed the
            phone layout into a horizontal scroll. */}
        <nav
          aria-label="Account"
          className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:h-fit"
        >
          <ul className="-mx-4 flex gap-1 overflow-x-auto scrollbar-none px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href} className="shrink-0 lg:shrink">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'block whitespace-nowrap rounded px-3 py-2 text-sm transition-colors lg:whitespace-normal lg:px-2.5',
                      active
                        ? 'bg-ink-100 font-medium text-ink-950 dark:bg-surface-active'
                        : 'text-ink-600 hover:bg-ink-50 dark:hover:bg-surface-hover hover:text-ink-950',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 hidden border-t border-line pt-4 lg:block">
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="px-2.5 text-sm text-ink-500 transition-colors hover:text-ink-950"
            >
              Sign out
            </button>
          </div>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
