import type { Metadata } from 'next';
import { InboxView } from '@/components/inbox-view';

export const metadata: Metadata = {
  title: 'Notifications & inbox',
  robots: { index: false, follow: false },
};

export default function InboxPage() {
  return <InboxView />;
}
