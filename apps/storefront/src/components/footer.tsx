'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export function Footer() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">Help</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/pages/faq" className="hover:underline">FAQ</Link></li>
            <li><Link href="/pages/shipping_info" className="hover:underline">Shipping</Link></li>
            <li><Link href="/pages/returns_info" className="hover:underline">Returns</Link></li>
            <li><Link href="/pages/contact_info" className="hover:underline">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">Legal</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/pages/privacy_policy" className="hover:underline">Privacy policy</Link></li>
            <li><Link href="/pages/terms" className="hover:underline">Terms &amp; conditions</Link></li>
            <li><Link href="/pages/cookie_policy" className="hover:underline">Cookie policy</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">Newsletter</h3>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.post('/newsletter/subscribe', { email });
                setMessage('Subscribed! Watch your inbox for campaign news.');
                setEmail('');
              } catch {
                setMessage('Please enter a valid email address.');
              }
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email for newsletter"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Join
            </button>
          </form>
          {message ? <p className="mt-2 text-xs text-gray-500">{message}</p> : null}
        </div>
      </div>
      <div className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        Outlet Marketplace — local development build. Not affiliated with any listed brand.
      </div>
    </footer>
  );
}
