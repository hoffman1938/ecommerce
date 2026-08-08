import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { DemoBanner } from '@/components/demo-banner';
import { ThemeScript } from '@/components/theme';
import { Reveal } from '@/lib/use-reveal';
import { getServerI18n } from '@/lib/server-i18n';

/**
 * Self-hosted at build time by next/font, so there is no third-party request
 * at runtime and no layout shift while the face loads.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'Outlet Marketplace — brand deals up to 60% off',
    template: '%s | Outlet Marketplace',
  },
  description:
    'Limited-stock outlet deals from Adidas, Nike, Puma, Tommy Hilfiger, Calvin Klein and more.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = getServerI18n();

  return (
    // suppressHydrationWarning: ThemeScript sets data-theme before React
    // hydrates, so the server markup intentionally differs on this element.
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-screen flex-col bg-ink-25">
        <Providers locale={locale}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-25"
          >
            Skip to content
          </a>
          <DemoBanner />
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <Reveal />
        </Providers>
      </body>
    </html>
  );
}
