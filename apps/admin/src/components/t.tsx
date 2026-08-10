'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Renders a translated string in JSX position.
 *
 * Exists so a component can show translated text without taking the hook
 * itself — which matters in the panel, where much of the copy sits inside
 * small presentational helpers rather than in the component holding the state.
 */
export function T({ id, vars }: { id: string; vars?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <>{t(id, vars)}</>;
}
