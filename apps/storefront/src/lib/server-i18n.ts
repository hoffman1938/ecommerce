import { cookies } from 'next/headers';
import en from '@/locales/en.json';
import ka from '@/locales/ka.json';
import ru from '@/locales/ru.json';
import { type Locale } from './i18n';

const LOCALES: Record<Locale, typeof en> = { en, ka, ru };

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

export function getServerI18n() {
  const cookieStore = cookies();
  const locale = (cookieStore.get('outlet-locale')?.value as Locale) || 'en';
  const currentLocale = locale in LOCALES ? locale : 'en';

  const t = (key: string, vars?: Record<string, string | number>): string => {
    let str = resolve(LOCALES[currentLocale] as unknown as Record<string, unknown>, key);
    if (str === key) {
      str = resolve(LOCALES.en as unknown as Record<string, unknown>, key);
    }
    if (vars) {
      str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
    }
    return str;
  };

  return { t, locale: currentLocale };
}
