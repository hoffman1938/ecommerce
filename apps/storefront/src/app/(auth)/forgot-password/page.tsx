'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, DEMO_MODE } from '@/lib/api';
import { T } from '@/components/t';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-sm py-8 lg:py-10">
      <h1 className="text-2xl font-bold">
        <T id="ui.resetPassword" />
      </h1>
      {sent ? (
        <div className="mt-4 space-y-3 text-ink-600">
          {DEMO_MODE ? (
            resetUrl ? (
              <>
                <p>
                  The demo has no mail server, so the reset link is shown here instead of being
                  emailed.
                </p>
                <Link
                  href={resetUrl}
                  className="inline-block rounded bg-ink-950 px-4 py-2 text-sm font-semibold text-ink-25 hover:bg-ink-800"
                >
                  <T id="ui.openResetLink" />
                </Link>
              </>
            ) : (
              <p>
                If that email is registered, a reset link would be sent. No account matches this
                address in the demo.
              </p>
            )
          ) : (
            <p>
              If that email is registered, a reset link is on its way. In local development, check
              Mailpit at{' '}
              <a
                className="underline"
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
              >
                localhost:8025
              </a>
              .
            </p>
          )}
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await api
              .post<{ resetUrl: string | null }>('/auth/forgot-password', { email })
              .catch(() => null);
            setResetUrl(result?.resetUrl ?? null);
            setSent(true);
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
              className="w-full rounded border border-ink-300 px-3 py-2"
            />
          </label>
          <button className="w-full rounded bg-ink-950 px-4 py-2.5 text-sm font-semibold text-ink-25 hover:bg-ink-800">
            <T id="ui.sendResetLink" />
          </button>
        </form>
      )}
    </div>
  );
}
