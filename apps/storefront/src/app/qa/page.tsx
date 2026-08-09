import type { Metadata } from 'next';
import { QaConsole } from '@/components/qa-console';

export const metadata: Metadata = {
  title: 'Simulation control center',
  description: 'QA controls for the simulated storefront.',
  // A tester tool has no business in search results, even if robots.txt
  // already blocks this deployment.
  robots: { index: false, follow: false },
};

export default function QaPage() {
  return <QaConsole />;
}
