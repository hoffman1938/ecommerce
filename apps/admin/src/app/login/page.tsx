'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

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
          OUTLET<span className="text-red-600">.</span> Admin
        </h1>
        <p className="mt-1 text-sm text-gray-500">Sign in with an administrator account.</p>
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
              const me = await api.get<{ user: { permissions: string[] } | null }>('/auth/me');
              if (!me.user || me.user.permissions.length === 0) {
                await api.post('/auth/logout').catch(() => undefined);
                setError('This account has no admin permissions.');
                setBusy(false);
                return;
              }
              await queryClient.invalidateQueries();
              router.push('/');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Login failed.');
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
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
            <span className="mb-1 block font-medium">Password</span>
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
        <p className="mt-4 text-xs text-gray-400">Local seed: admin@example.local / Admin123!</p>
      </div>
    </div>
  );
}
