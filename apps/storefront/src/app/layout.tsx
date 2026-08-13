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
import { organizationJsonLd, SITE_NAME, SITE_URL } from '@/lib/structured-data';
import { T } from '@/components/t';

/**
 * Self-hosted at build time by next/font, so there is no third-party request
 * at runtime and no layout shift while the face loads.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const DESCRIPTION =
  'Limited-stock outlet deals on clothing, footwear, bags and accessories from Aster, Northline, Monarch, Lunaro and more.';

export const metadata: Metadata = {
  // Lets Next resolve the relative `canonical` paths pages declare into
  // absolute URLs, and gives Open Graph images an origin to hang off.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Outlet Marketplace — brand deals up to 60% off',
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'Outlet Marketplace — brand deals up to 60% off',
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Outlet Marketplace — brand deals up to 60% off',
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeScript sets data-theme before React
    // hydrates, so the server markup intentionally differs on this element.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-ink-25">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-25"
          >
            <T id="ui.skipContent" />
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
