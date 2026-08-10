'use client';

import { LOCALE_LABELS, useI18n, type Locale } from '@/lib/i18n';
import { cx } from '@outlet/ui';
import { useRouter } from 'next/navigation';

const LOCALES = Object.keys(LOCALE_LABELS) as Locale[];

export function LocaleSwitcher() {
  const { t, locale, setLocale  } = useI18n();
  const router = useRouter();

  const handleLocaleChange = (l: Locale) => {
    setLocale(l);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={t('ui.selectLanguage')}>
      {LOCALES.map((l, i) => (
        <button
          key={l}
          type="button"
          onClick={() => handleLocaleChange(l)}
          aria-pressed={locale === l}
          className={cx(
            'h-7 rounded px-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150',
            locale === l
              ? // A solid block is the right weight on white, but on near-black
                // the same treatment fires a bright chip into the corner of the
                // header. Dark marks the selection with a raised surface and
                // full-strength label instead.
                'bg-ink-950 text-ink-25 dark:bg-surface-active dark:text-ink-950 dark:ring-1 dark:ring-inset dark:ring-line-strong'
              : 'text-ink-500 hover:bg-ink-100 hover:text-ink-950 dark:hover:bg-surface-hover',
            i > 0 && 'ml-px',
          )}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
