'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Verifying your email…');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('The verification link is missing its token.');
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('ok');
        setMessage('Your email is verified. You can now sign in.');
      })
      .catch((err) => {
        setState('error');
        setMessage(err instanceof ApiError ? err.message : 'Verification failed.');
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-sm py-12 text-center lg:py-16">
      <h1 className="text-2xl font-bold" data-testid="verify-result">
        {state === 'working'
          ? 'One moment…'
          : state === 'ok'
            ? 'Email verified ✓'
            : 'Verification failed'}
      </h1>
      <p className="mt-3 text-ink-600">{message}</p>
      {state !== 'working' ? (
        <Link
          href="/login"
          className="mt-6 inline-block rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25"
        >
          <T id="ui.goSign" />
        </Link>
      ) : null}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
