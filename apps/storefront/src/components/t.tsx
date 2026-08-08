'use client';

import { useI18n } from '@/lib/i18n';

export function T({ id, vars }: { id: string; vars?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <>{t(id, vars)}</>;
}
