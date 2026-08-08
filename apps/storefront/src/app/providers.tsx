'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nProvider, type Locale } from '@/lib/i18n';

export function Providers({ children, locale }: { children: ReactNode; locale: Locale }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale={locale}>{children}</I18nProvider>
    </QueryClientProvider>
  );
}
