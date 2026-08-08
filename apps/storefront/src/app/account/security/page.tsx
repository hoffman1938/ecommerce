'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

export default function SecurityPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">Password &amp; security</h1>
      <p className="mt-1 text-sm text-gray-500">
        Changing your password signs out every other device.
      </p>
      {message ? (
        <p className={`mt-4 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      ) : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage(null);
          try {
            await api.post('/auth/change-password', { currentPassword, newPassword });
            setMessage({ ok: true, text: 'Password changed.' });
            setCurrentPassword('');
            setNewPassword('');
          } catch (err) {
            setMessage({
              ok: false,
              text: err instanceof ApiError ? err.message : 'Password change failed.',
            });
          }
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Current password</span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <button className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-ink-25 hover:bg-gray-700">
          Change password
        </button>
      </form>
    </div>
  );
}
