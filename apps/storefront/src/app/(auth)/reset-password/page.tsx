'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';

function ResetInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (state === 'ok') {
    return (
      <div className="mx-auto max-w-sm py-12 text-center lg:py-16">
        <h1 className="text-2xl font-bold"><T id="ui.passwordUpdated" /></h1>
        <p className="mt-3 text-ink-600"><T id="ui.allOtherSessionsWereSigned" /></p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25"
        ><T id="ui.sign" /></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-8 lg:py-10">
      <h1 className="text-2xl font-bold"><T id="ui.chooseNewPassword" /></h1>
      {message ? <p className="mt-4 text-sm text-sale-500">{message}</p> : null}
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
          <span className="mb-1 block font-medium"><T id="ui.newPassword" /></span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-ink-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-ink-500"><T id="ui.atLeast8CharactersWith2" /></span>
        </label>
        <button className="w-full rounded bg-ink-950 px-4 py-2.5 text-sm font-semibold text-ink-25 hover:bg-ink-800"><T id="ui.updatePassword" /></button>
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
