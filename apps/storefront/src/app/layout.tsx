import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: {
    default: 'Outlet Marketplace — brand deals up to 60% off',
    template: '%s | Outlet Marketplace',
  },
  description:
    'Limited-stock outlet deals from Adidas, Nike, Puma, Tommy Hilfiger, Calvin Klein and more.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
