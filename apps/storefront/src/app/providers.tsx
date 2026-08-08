'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n';
import { recentAnalyticsEvents, registerAnalyticsSink } from '@/lib/analytics';

/**
 * In development, make the analytics stream observable: events are logged and
 * the buffer is reachable as `window.__outletAnalytics()`. Without this the
 * event layer is invisible until a real provider is wired up, and silently
 * broken tracking is worse than none.
 *
 * Production registers no sink, so nothing is emitted anywhere.
 */
function useDevAnalyticsSink(): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const unregister = registerAnalyticsSink((event) => {
      console.debug('[analytics]', event.name, event.payload);
    });
    (window as unknown as Record<string, unknown>).__outletAnalytics = recentAnalyticsEvents;
    return () => {
      unregister();
      delete (window as unknown as Record<string, unknown>).__outletAnalytics;
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  useDevAnalyticsSink();

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
}
