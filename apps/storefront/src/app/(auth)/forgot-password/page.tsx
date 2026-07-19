'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      {sent ? (
        <p className="mt-4 text-gray-600">
          If that email is registered, a reset link is on its way. In local development, check
          Mailpit at{' '}
          <a className="underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
            localhost:8025
          </a>
          .
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.post('/auth/forgot-password', { email }).catch(() => undefined);
            setSent(true);
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
            />
          </label>
          <button className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700">
            Send reset link
          </button>
        </form>
      )}
    </div>
  );
}
