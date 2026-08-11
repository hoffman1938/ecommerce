'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminUser, hasPermission } from '@/lib/hooks';
import { api, DEMO_MODE } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

const NAV: Array<{ href: string; labelKey: string; permission: string }> = [
  { href: '/', labelKey: 'admin.dashboard', permission: 'dashboard.view' },
  { href: '/products', labelKey: 'admin.products', permission: 'products.view' },
  { href: '/categories', labelKey: 'admin.categories', permission: 'products.view' },
  { href: '/inventory', labelKey: 'admin.inventory', permission: 'inventory.view' },
  { href: '/reservations', labelKey: 'admin.reservations', permission: 'reservations.view' },
  { href: '/campaigns', labelKey: 'admin.campaigns', permission: 'campaigns.view' },
  { href: '/orders', labelKey: 'admin.orders', permission: 'orders.view' },
  { href: '/returns', labelKey: 'admin.returns', permission: 'returns.view' },
  { href: '/customers', labelKey: 'admin.customers', permission: 'customers.view' },
  { href: '/coupons', labelKey: 'admin.coupons', permission: 'coupons.view' },
  { href: '/reviews', labelKey: 'admin.reviews', permission: 'reviews.view' },
  { href: '/content', labelKey: 'admin.content', permission: 'content.manage' },
  { href: '/audit-logs', labelKey: 'admin.auditLogs', permission: 'audit_logs.view' },
  { href: '/admin-users', labelKey: 'admin.adminUsers', permission: 'admin_users.manage' },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
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
    return (
      <p className="py-16 text-center text-gray-500">
        <T id="ui.loadingAdminPanel" />
      </p>
    );
  }
  const user = me.user;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-4">
          <p className="font-black">
            OUTLET<span className="text-red-600">.</span>
            <T id="ui.admin" />
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
              {t(item.labelKey)}
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
            <T id="ui.signOut" />
          </button>
        </nav>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <DemoBanner />
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

/**
 * States plainly what the static build is, for the same reason the storefront
 * carries one: someone handed this URL without context would otherwise assume
 * they are looking at a real back office with real orders behind it.
 */
function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900">
      <strong>
        <T id="ui.demoBuild" />
      </strong>{' '}
      Sample data only — no server, no database. Changes are saved in this browser and are visible
      only to you. Review moderation is fully working; most other edits are disabled. Sign-in is not
      authentication — <strong>never enter a real password.</strong>
    </div>
  );
}
