'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminUser, hasPermission } from '@/lib/hooks';
import { api } from '@/lib/api';

const NAV: Array<{ href: string; label: string; permission: string }> = [
  { href: '/', label: 'Dashboard', permission: 'dashboard.view' },
  { href: '/products', label: 'Products', permission: 'products.view' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/reservations', label: 'Reservations', permission: 'reservations.view' },
  { href: '/campaigns', label: 'Campaigns', permission: 'campaigns.view' },
  { href: '/orders', label: 'Orders', permission: 'orders.view' },
  { href: '/returns', label: 'Returns', permission: 'returns.view' },
  { href: '/customers', label: 'Customers', permission: 'customers.view' },
  { href: '/coupons', label: 'Coupons', permission: 'coupons.view' },
  { href: '/reviews', label: 'Reviews', permission: 'reviews.view' },
  { href: '/content', label: 'Content & settings', permission: 'content.manage' },
  { href: '/audit-logs', label: 'Audit logs', permission: 'audit_logs.view' },
  { href: '/admin-users', label: 'Admin users', permission: 'admin_users.manage' },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useAdminUser();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && (!me?.user || me.user.permissions.length === 0)) {
      router.replace('/login');
    }
  }, [isLoading, me?.user, router]);

  if (isLoading || !me?.user) {
    return <p className="py-16 text-center text-gray-500">Loading admin panel…</p>;
  }
  const user = me.user;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-4">
          <p className="font-black">
            OUTLET<span className="text-red-600">.</span> Admin
          </p>
          <p className="mt-1 truncate text-xs text-gray-500">{user.email}</p>
          <p className="truncate text-xs text-gray-400">{user.roles.join(', ')}</p>
        </div>
        <nav className="p-2 text-sm">
          {NAV.filter((item) => hasPermission(user, item.permission)).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 hover:bg-gray-100 ${
                pathname === item.href ? 'bg-gray-100 font-semibold' : 'text-gray-600'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={async () => {
              await api.post('/auth/logout').catch(() => undefined);
              queryClient.clear();
              router.push('/login');
            }}
            className="mt-4 block w-full rounded px-3 py-2 text-left text-gray-400 hover:bg-gray-100"
          >
            Sign out
          </button>
        </nav>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
