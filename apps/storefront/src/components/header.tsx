'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart, useCurrentUser, useLogout } from '@/lib/hooks';

const CATEGORIES = [
  { label: 'T-Shirts', slug: 't-shirts' },
  { label: 'Shoes', slug: 'shoes' },
  { label: 'Hoodies', slug: 'hoodies' },
  { label: 'Jackets', slug: 'jackets' },
  { label: 'Pants', slug: 'pants' },
  { label: 'Accessories', slug: 'accessories' },
];

export function Header() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const { data: me } = useCurrentUser();
  const { data: cart } = useCart();
  const logout = useLogout();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="shrink-0 text-xl font-black tracking-tight">
          OUTLET<span className="text-red-600">.</span>
        </Link>

        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/products');
          }}
          role="search"
        >
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search products or brands…"
            aria-label="Search"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </form>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/wishlist" className="hover:underline">
            Wishlist
          </Link>
          <Link href="/cart" className="font-medium hover:underline" data-testid="cart-link">
            Cart{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ''}
          </Link>
          {me?.user ? (
            <div className="flex items-center gap-3">
              <Link href="/account" className="hover:underline">
                {me.user.firstName}
              </Link>
              <button
                type="button"
                onClick={() => logout.mutate()}
                className="text-gray-500 hover:underline"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="hover:underline">
              Sign in
            </Link>
          )}
        </nav>
      </div>

      <nav className="border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 py-2 text-sm">
          <Link href="/campaigns" className="whitespace-nowrap font-semibold text-red-600 hover:underline">
            Campaigns
          </Link>
          <Link href="/products" className="whitespace-nowrap hover:underline">
            All products
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="whitespace-nowrap hover:underline">
              {c.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
