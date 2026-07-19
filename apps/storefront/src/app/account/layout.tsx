'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useCurrentUser } from '@/lib/hooks';

const NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/returns', label: 'Returns & refunds' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/profile', label: 'Personal information' },
  { href: '/account/security', label: 'Password & security' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/wishlist', label: 'Wishlist' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !me?.user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, me?.user, pathname, router]);

  if (isLoading || !me?.user) {
    return <p className="py-10 text-center text-gray-500">Loading your account…</p>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-4">
      <nav className="h-fit rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <p className="mb-3 font-semibold">
          {me.user.firstName} {me.user.lastName}
        </p>
        <ul className="space-y-1">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded px-2 py-1.5 hover:bg-gray-100 ${
                  pathname === item.href ? 'bg-gray-100 font-medium' : 'text-gray-600'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="lg:col-span-3">{children}</div>
    </div>
  );
}
