'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import en from '@/locales/en.json';
import ka from '@/locales/ka.json';
import ru from '@/locales/ru.json';

export type Locale = 'en' | 'ka' | 'ru';

const STORAGE_KEY = 'outlet-locale';
const LOCALES: Record<Locale, typeof en> = { en, ka, ru };
export const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', ka: 'KA', ru: 'RU' };

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
}

const Ctx = createContext<I18nContext>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({
  children,
  initialLocale = 'en',
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored && stored in LOCALES && stored !== initialLocale) {
        setLocaleState(stored);
        document.cookie = `${STORAGE_KEY}=${stored}; path=/; max-age=31536000; samesite=lax`;
      } else if (initialLocale) {
        localStorage.setItem(STORAGE_KEY, initialLocale);
      }
    } catch {
      // localStorage unavailable (SSR or private mode)
    }
  }, [initialLocale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
      document.cookie = `${STORAGE_KEY}=${l}; path=/; max-age=31536000; samesite=lax`;
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

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nContext {
  return useContext(Ctx);
}
