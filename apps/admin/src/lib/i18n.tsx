'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import en from '../../../storefront/src/locales/en.json';
import ka from '../../../storefront/src/locales/ka.json';
import ru from '../../../storefront/src/locales/ru.json';

/**
 * Admin i18n, deliberately reading the *storefront's* locale files and the
 * storefront's storage key.
 *
 * The two apps are served from one origin in the demo deployment (the panel
 * lives under /admin), so `localStorage` is shared: choosing Georgian on the
 * shop is what switches the panel, with no second control and no way for the
 * two to disagree. Importing the same JSON rather than copying it means an
 * admin label and its storefront counterpart can never drift.
 */

export type Locale = 'en' | 'ka' | 'ru';

const STORAGE_KEY = 'outlet-locale';
const LOCALES: Record<Locale, typeof en> = { en, ka, ru };

export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  ka: 'ka-GE',
  ru: 'ru-RU',
};

/** Same rates as the storefront — the panel must quote what the shop quotes. */
export const LOCALE_CURRENCY: Record<Locale, { code: string; rateFromBase: number }> = {
  en: { code: 'USD', rateFromBase: 1.08 },
  ka: { code: 'GEL', rateFromBase: 2.95 },
  ru: { code: 'USD', rateFromBase: 1.08 },
};

export function formatMoneyIn(locale: Locale, amountMinorBase: number): string {
  const { code, rateFromBase } = LOCALE_CURRENCY[locale];
  const converted = Math.round(amountMinorBase * rateFromBase);
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  };
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      ...options,
      currencyDisplay: 'narrowSymbol',
    }).format(converted / 100);
  } catch {
    return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(converted / 100);
  }
}

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
  money: (amountMinorBase: number) => string;
}

const Ctx = createContext<I18nContext>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
  money: (amount) => formatMoneyIn('en', amount),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
        if (stored && stored in LOCALES) setLocaleState(stored);
      } catch {
        // Storage unavailable — English it is.
      }
    };
    read();
    // `storage` fires when the shop changes the language in another tab, so the
    // panel follows without a reload.
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
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
      if (str === key) str = resolve(LOCALES.en as unknown as Record<string, unknown>, key);
      if (vars) str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
      return str;
    },
    [locale],
  );

  const money = useCallback(
    (amountMinorBase: number) => formatMoneyIn(locale, amountMinorBase),
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t, money }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nContext {
  return useContext(Ctx);
}
