'use client';

/**
 * Shown only on the Cloudflare Pages demo build.
 *
 * The whole shop works here, but it works *in the browser* — there is no
 * NestJS API, PostgreSQL or Redis behind this deployment. Saying so plainly
 * matters: a visitor who places an order should know it is not a real order,
 * and that their data never leaves their own machine.
 *
 * The disclosure itself is not dismissible — it is the one thing on the page
 * that must always be true and visible. What *is* collapsible is the detail:
 * test credentials and the QA entry point are things you go looking for, not
 * things that should cost three lines above every page on a phone.
 */
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, cx } from '@outlet/ui';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

export function DemoBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;

  return (
    <div className="border-b border-warning-100 bg-warning-50 text-warning-700">
      <div className="container-page flex min-h-9 flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1.5 text-[13px] leading-snug">
        {/* The disclosure has to fit one line on a phone or it costs three rows
            above every page; the fuller wording returns as soon as there is
            room for it. */}
        <span>
          <strong className="font-semibold"><T id="ui.sandbox" /></strong>{' '}
          <span className="sm:hidden"><T id="ui.nothingHereReal" /></span>
          <span className="hidden sm:inline"><T id="ui.everythingWorksNothingRealPayments" /></span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 font-semibold underline decoration-warning-600/40 underline-offset-2 transition-colors hover:text-warning-600"
        >
          {open ? t('ui.hideDetails') : t('ui.details')}
          <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open ? (
        <div className="container-page animate-slide-up border-t border-warning-100 py-2.5 text-[13px] leading-relaxed">
          <p>
            <T id="ui.demoRunsInBrowser" />
          </p>
          <p className="mt-1.5"><T id="ui.signWith" /><code className="rounded bg-warning-100 px-1">customer@example.local</code>{' '}
            / <code className="rounded bg-warning-100 px-1">Customer123!</code>
            <T id="ui.orRegisterAnyAddress" />{' '}
            <Link href="/qa" className="font-semibold underline underline-offset-2"><T id="ui.openQaControlCenter" /></Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
