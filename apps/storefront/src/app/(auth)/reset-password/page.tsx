'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

function ResetInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (state === 'ok') {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="text-2xl font-bold">Password updated ✓</h1>
        <p className="mt-3 text-gray-600">All other sessions were signed out for your security.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-ink-25"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post('/auth/reset-password', { token, password });
            setState('ok');
          } catch (err) {
            setState('error');
            setMessage(err instanceof ApiError ? err.message : 'Reset failed.');
          }
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">
            At least 8 characters with upper- and lowercase letters and a digit.
          </span>
        </label>
        <button className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-ink-25 hover:bg-gray-700">
          Update password
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
