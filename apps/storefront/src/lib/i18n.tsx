'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import en from '@/locales/en.json';
import ka from '@/locales/ka.json';
import ru from '@/locales/ru.json';

export type Locale = 'en' | 'ka' | 'ru';

const STORAGE_KEY = 'outlet-locale';
const LOCALES: Record<Locale, typeof en> = { en, ka, ru };
export const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', ka: 'KA', ru: 'RU' };

/**
 * Money presentation per locale.
 *
 * The catalogue is priced once, in the base currency below; a locale decides
 * how that figure is *shown*, never what it is worth. Rates are therefore a
 * display convention for the demo rather than a live FX feed — a real
 * deployment would price per market rather than converting at render time.
 *
 * Georgian switches to lari because that is the market it addresses; Russian
 * stays on dollars deliberately, since a rouble price would imply a storefront
 * that does not exist here.
 */
export const BASE_CURRENCY = 'EUR';

export const LOCALE_CURRENCY: Record<Locale, { code: string; rateFromBase: number }> = {
  en: { code: 'USD', rateFromBase: 1.08 },
  ka: { code: 'GEL', rateFromBase: 2.95 },
  ru: { code: 'USD', rateFromBase: 1.08 },
};

/**
 * BCP-47 tags for Intl, which does not know our two-letter locale keys.
 *
 * `en-US` rather than `en-GB` on purpose: pairing en-GB with USD renders the
 * disambiguating "US$42.76", which is the correct thing for a British reader
 * looking at a foreign currency and the wrong thing for a shop whose prices
 * simply are dollars.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  ka: 'ka-GE',
  ru: 'ru-RU',
};

/**
 * Converts a base-currency minor amount into the locale's currency and formats
 * it. Rounded to the minor unit *after* conversion so a total is never a
 * fraction of a cent adrift from the sum of its lines.
 */
export function formatMoneyIn(locale: Locale, amountMinorBase: number): string {
  const { code, rateFromBase } = LOCALE_CURRENCY[locale];
  const converted = Math.round(amountMinorBase * rateFromBase);
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  };
  try {
    // `narrowSymbol` is what turns GEL into ₾ and keeps USD as a bare $.
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      ...options,
      currencyDisplay: 'narrowSymbol',
    }).format(converted / 100);
  } catch {
    // Older engines reject the option outright rather than ignoring it.
    return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(converted / 100);
  }
}

/** Resolve a dot-separated key in a nested object, returning the string value or the key itself. */
function resolve(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof cur === 'string' ? cur : path;
}

interface I18nContext {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Formats a base-currency minor amount in the active locale's currency. */
  money: (amountMinorBase: number) => string;
  /** Locale-aware date/time, so timestamps are not stranded in English. */
  formatDate: (iso: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
}

const Ctx = createContext<I18nContext>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
  money: (amount) => formatMoneyIn('en', amount),
  formatDate: (iso) => String(iso),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored && stored in LOCALES) setLocaleState(stored);
    } catch {
      // localStorage unavailable (SSR or private mode)
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let str = resolve(LOCALES[locale] as unknown as Record<string, unknown>, key);
      if (str === key) {
        // fall back to English
        str = resolve(LOCALES.en as unknown as Record<string, unknown>, key);
      }
      if (vars) {
        str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
      }
      return str;
    },
    [locale],
  );

  const money = useCallback((amountMinorBase: number) => formatMoneyIn(locale, amountMinorBase), [
    locale,
  ]);

  const formatDate = useCallback(
    (iso: string | Date, opts?: Intl.DateTimeFormatOptions) => {
      const date = typeof iso === 'string' ? new Date(iso) : iso;
      return new Intl.DateTimeFormat(
        INTL_LOCALE[locale],
        opts ?? { dateStyle: 'medium', timeStyle: 'short' },
      ).format(date);
    },
    [locale],
  );

  return (
    <Ctx.Provider value={{ locale, setLocale, t, money, formatDate }}>{children}</Ctx.Provider>
  );
}

export function useI18n(): I18nContext {
  return useContext(Ctx);
}
