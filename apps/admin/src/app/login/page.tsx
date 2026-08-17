'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, DEMO_MODE } from '@/lib/api';
import type { AdminSessionUser } from '@/lib/hooks';
import { T } from '@/components/t';

/** The `/auth/me` envelope, in the shape `useAdminUser` caches it under. */
type AdminMe = { user: AdminSessionUser | null };

/**
 * Whether this panel is pointed at the local Docker stack, whose Postgres seed
 * creates the fixed pair the hint below names. NEXT_PUBLIC_BACKEND is set by
 * build-demo.mjs for the Cloudflare export, whose D1 seed uses different
 * accounts and a password chosen at seed time — printing the Postgres pair
 * there would be advertising credentials that do not work. Not a hostname
 * check: the Worker runs on localhost too when you develop against it.
 */
const LOCAL_STACK = !DEMO_MODE && !process.env.NEXT_PUBLIC_BACKEND;

export default function AdminLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">
          OUTLET<span className="text-red-600">.</span>
          <T id="ui.admin" />
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          <T id="ui.signWithAdministratorAccount" />
        </p>
        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post('/auth/login', { email, password });
              const me = await api.get<AdminMe>('/auth/me');
              if (!me.user || me.user.permissions.length === 0) {
                await api.post('/auth/logout').catch(() => undefined);
                setError('This account has no admin permissions.');
                setBusy(false);
                return;
              }
              /*
               * Write the session into the cache before navigating, rather than
               * only invalidating.
               *
               * Reaching this screen normally means the panel sent you here: the
               * layout asked `/auth/me`, got `{ user: null }`, and redirected —
               * which leaves that answer cached under `admin-me`.
               * `invalidateQueries` marks it stale but does not refetch a query
               * nothing is subscribed to, so the layout would mount, read the
               * stale `null` with `isLoading` already false, and bounce straight
               * back here. A correct password looked like a silently ignored one,
               * and only a manual reload got you in.
               *
               * The response we just received is the truth, so it is written
               * directly. Everything else is still invalidated, because it was
               * fetched as nobody.
               */
              queryClient.setQueryData(['admin-me'], me);
              await queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] !== 'admin-me',
              });
              router.push('/');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Login failed.');
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              <T id="ui.email" />
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              data-testid="admin-email"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              <T id="ui.password" />
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              data-testid="admin-password"
            />
          </label>
          <button
            disabled={busy}
            className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:bg-gray-400"
            data-testid="admin-login-submit"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {DEMO_MODE ? (
          /*
           * The demo accepts any credentials — there is no user table to check
           * against. Saying so here matters more than anywhere else in the
           * panel: this is the one screen with a password field, and a
           * convincing-looking login invites a real password into a store that
           * is plain localStorage.
           */
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>
              <T id="ui.demoBuildThisNotAuthentication" />
            </strong>{' '}
            Any email and password are accepted, and nothing is checked or encrypted.{' '}
            <strong>
              <T id="ui.doNotEnterRealPassword" />
            </strong>
          </p>
        ) : LOCAL_STACK ? (
          /*
           * Only true of the Docker stack, whose Postgres seed creates exactly
           * this pair. The Cloudflare deployment seeds admin@demo.local with a
           * password chosen at seed time and never written down, so printing
           * this there would be advertising credentials that do not work.
           */
          <p className="mt-4 text-xs text-gray-400">
            <T id="ui.localSeedAdminExampleLocal" />
          </p>
        ) : null}
      </div>
    </div>
  );
}
