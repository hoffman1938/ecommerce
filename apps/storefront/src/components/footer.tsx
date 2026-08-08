'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, cx } from '@outlet/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [pending, setPending] = useState(false);

  const HELP_LINKS = [
    { href: '/pages/faq', label: t('footer.helpLinks.faq') },
    { href: '/pages/shipping_info', label: t('footer.helpLinks.shipping') },
    { href: '/pages/returns_info', label: t('footer.helpLinks.returns') },
    { href: '/pages/contact_info', label: t('footer.helpLinks.contact') },
  ];

  const LEGAL_LINKS = [
    { href: '/pages/privacy_policy', label: t('footer.legalLinks.privacy') },
    { href: '/pages/terms', label: t('footer.legalLinks.terms') },
    { href: '/pages/cookie_policy', label: t('footer.legalLinks.cookies') },
  ];

  const SHOP_LINKS = [
    { href: '/campaigns', label: t('footer.shopLinks.campaigns') },
    { href: '/products?sort=discount', label: t('footer.shopLinks.bestDiscounts') },
    { href: '/products?sort=newest', label: t('footer.shopLinks.newArrivals') },
    { href: '/products', label: t('footer.shopLinks.allProducts') },
  ];

  return (
    <footer className="mt-20 border-t border-ink-200 bg-ink-25">
      <div className="container-page">
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8 lg:py-14">
          {/* The newsletter leads on desktop and drops to the end on mobile,
              where the utility links matter more than the signup. */}
          <div className="order-last lg:order-first lg:col-span-5 lg:pr-12">
            <h3 className="text-lg font-semibold text-ink-950">{t('footer.newsletter')}</h3>
            <p className="mt-1.5 max-w-sm text-sm text-ink-600">{t('footer.newsletterDesc')}</p>
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
                {t('footer.emailPlaceholder')}
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
                placeholder={t('footer.emailPlaceholder')}
                aria-invalid={state === 'error' || undefined}
                className={cx(
                  'h-10 w-full rounded bg-ink-25 px-3 text-sm ring-1 ring-inset transition-shadow placeholder:text-ink-400',
                  state === 'error' ? 'ring-sale-500' : 'ring-ink-300 hover:ring-ink-400',
                )}
              />
              <Button type="submit" loading={pending}>
                {t('footer.join')}
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
                ? t('footer.subscribeOk')
                : state === 'error'
                  ? t('footer.subscribeError')
                  : ' '}
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7">
            <FooterColumn title={t('footer.shop')} links={SHOP_LINKS} />
            <FooterColumn title={t('footer.help')} links={HELP_LINKS} />
            <FooterColumn title={t('footer.legal')} links={LEGAL_LINKS} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-ink-200 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          {/* No dynamic year: the page is prerendered, so a year computed at
              build time would mismatch the client's on New Year's Day. */}
          <p>{t('footer.copyright')}</p>
          <p>{t('footer.demoNotice')}</p>
        </div>
      </div>
    </footer>
  );
}
