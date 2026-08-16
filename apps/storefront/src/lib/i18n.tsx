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
 * Georgian is the shop's own language, not a translation of it.
 *
 * This is the locale the static export is pre-rendered in, so it is what a
 * first-time visitor reads before any JavaScript runs — the site should not
 * introduce itself in English and correct itself a moment later. A stored
 * choice still wins, and English remains the fallback for any key Georgian
 * has not yet been given.
 */
export const DEFAULT_LOCALE: Locale = 'ka';

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

/**
 * Georgian month and weekday names, for engines whose ICU data omits `ka`.
 *
 * `Intl` does not fail when it has no data for a locale — it quietly resolves
 * to the default and formats in English. On a build without Georgian data
 * (`supportedLocalesOf(['ka-GE'])` comes back empty, while ru, de and ja do
 * not) every date on a Georgian-language page therefore reads "Aug 19": the
 * delivery estimate in the bag, a campaign's opening date, the stamps down an
 * order's timeline. Georgian is this shop's default language, so that is not a
 * cosmetic gap, and the words are few enough to carry ourselves.
 */
const KA_MONTHS_LONG = [
  'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
  'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი',
];
const KA_MONTHS_SHORT = [
  'იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ',
];
const KA_WEEKDAYS_LONG = [
  'კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი',
];
const KA_WEEKDAYS_SHORT = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];

/** Whether the engine has real data for a tag, rather than silently using English. */
function intlHasLocale(tag: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0;
  } catch {
    return false;
  }
}

/**
 * Georgian dates assembled by hand.
 *
 * `en-GB` supplies the skeleton because it orders day before month exactly as
 * Georgian does, so only the words have to be replaced — the separators,
 * numerals and time parts the caller asked for all survive untouched.
 */
function formatGeorgian(date: Date, options: Intl.DateTimeFormatOptions): string {
  const formatter = new Intl.DateTimeFormat('en-GB', options);
  const wantsLongMonth = formatter.resolvedOptions().month === 'long';
  const wantsLongWeekday = formatter.resolvedOptions().weekday === 'long';

  return formatter
    .formatToParts(date)
    .map((part) => {
      // A numeric month is already language-neutral; only names need replacing.
      if (part.type === 'month' && !/^\d+$/.test(part.value)) {
        return (wantsLongMonth ? KA_MONTHS_LONG : KA_MONTHS_SHORT)[date.getMonth()];
      }
      if (part.type === 'weekday') {
        return (wantsLongWeekday ? KA_WEEKDAYS_LONG : KA_WEEKDAYS_SHORT)[date.getDay()];
      }
      return part.value;
    })
    .join('');
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
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
  money: (amount) => formatMoneyIn(DEFAULT_LOCALE, amount),
  formatDate: (iso) => String(iso),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored && stored in LOCALES) setLocaleState(stored);
    } catch {
      // localStorage unavailable (SSR or private mode)
    }
  }, []);

  // The document's own language has to follow the switcher. It is what a
  // screen reader picks a voice from and what the browser offers to translate,
  // so leaving it at the pre-rendered value would announce Georgian copy in an
  // English accent for anyone who switched.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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

  const money = useCallback(
    (amountMinorBase: number) => formatMoneyIn(locale, amountMinorBase),
    [locale],
  );

  const formatDate = useCallback(
    (iso: string | Date, opts?: Intl.DateTimeFormatOptions) => {
      const date = typeof iso === 'string' ? new Date(iso) : iso;
      const options = opts ?? { dateStyle: 'medium', timeStyle: 'short' };
      if (locale === 'ka' && !intlHasLocale(INTL_LOCALE.ka)) {
        return formatGeorgian(date, options);
      }
      return new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(date);
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
