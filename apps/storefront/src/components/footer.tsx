'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, cx } from '@outlet/ui';
import { api } from '@/lib/api';

const HELP_LINKS = [
  { href: '/pages/faq', label: 'FAQ' },
  { href: '/pages/shipping_info', label: 'Shipping' },
  { href: '/pages/returns_info', label: 'Returns' },
  { href: '/pages/contact_info', label: 'Contact' },
];

const LEGAL_LINKS = [
  { href: '/pages/privacy_policy', label: 'Privacy policy' },
  { href: '/pages/terms', label: 'Terms & conditions' },
  { href: '/pages/cookie_policy', label: 'Cookie policy' },
];

const SHOP_LINKS = [
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/products?sort=discount', label: 'Best discounts' },
  { href: '/products?sort=newest', label: 'New arrivals' },
  { href: '/products', label: 'All products' },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="eyebrow mb-3">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-ink-600 transition-colors hover:text-ink-950"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [pending, setPending] = useState(false);

  return (
    <footer className="mt-20 border-t border-ink-200 bg-ink-25">
      <div className="container-page">
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8 lg:py-14">
          {/* The newsletter leads on desktop and drops to the end on mobile,
              where the utility links matter more than the signup. */}
          <div className="order-last lg:order-first lg:col-span-5 lg:pr-12">
            <h3 className="text-lg font-semibold text-ink-950">Get campaign alerts</h3>
            <p className="mt-1.5 max-w-sm text-sm text-ink-600">
              New drops sell out fast. We&apos;ll tell you the morning a campaign opens — nothing
              else.
            </p>
            <form
              className="mt-4 flex max-w-sm gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                try {
                  await api.post('/newsletter/subscribe', { email });
                  setState('ok');
                  setEmail('');
                } catch {
                  setState('error');
                } finally {
                  setPending(false);
                }
              }}
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setState('idle');
                }}
                placeholder="you@example.com"
                aria-invalid={state === 'error' || undefined}
                className={cx(
                  'h-10 w-full rounded bg-white px-3 text-sm ring-1 ring-inset transition-shadow placeholder:text-ink-400',
                  state === 'error' ? 'ring-sale-500' : 'ring-ink-300 hover:ring-ink-400',
                )}
              />
              <Button type="submit" loading={pending}>
                Join
              </Button>
            </form>
            <p
              className={cx(
                'mt-2 text-xs transition-opacity',
                state === 'idle' && 'opacity-0',
                state === 'ok' && 'text-success-700',
                state === 'error' && 'text-sale-600',
              )}
              role={state === 'error' ? 'alert' : 'status'}
            >
              {state === 'ok'
                ? 'You’re on the list.'
                : state === 'error'
                  ? 'Enter a valid email address.'
                  : ' '}
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7">
            <FooterColumn title="Shop" links={SHOP_LINKS} />
            <FooterColumn title="Help" links={HELP_LINKS} />
            <FooterColumn title="Legal" links={LEGAL_LINKS} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-ink-200 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          {/* No dynamic year: the page is prerendered, so a year computed at
              build time would mismatch the client's on New Year's Day. */}
          <p>© Outlet Marketplace</p>
          <p>Demonstration build. Not affiliated with any listed brand.</p>
        </div>
      </div>
    </footer>
  );
}
