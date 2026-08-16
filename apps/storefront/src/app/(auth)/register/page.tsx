'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@outlet/validation';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, TextField } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

export default function RegisterPage() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterInput) => {
    setError(null);
    try {
      await api.post('/auth/register', values);
      /*
       * Whether the account still needs an emailed verification link is not
       * something this page can assume: the Cloudflare deployment has no mail
       * provider and signs the new account in immediately, the local NestJS
       * stack sends to Mailpit and does not. Asking who we are afterwards
       * distinguishes the two by observation, so neither backend gets told
       * "check your email" when nothing was sent.
       */
      const me = await api
        .get<{ user: { id: string } | null }>('/auth/me')
        .catch(() => ({ user: null }));
      setSignedIn(Boolean(me?.user));
      if (me?.user) await queryClient.invalidateQueries();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed.');
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">
          {signedIn ? 'You’re all set' : 'Check your email'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          {signedIn ? (
            <T id="ui.registeredNoMailProvider" />
          ) : (
            <>
              We sent a verification link to your address. In local development, open Mailpit at{' '}
              <a
                className="underline underline-offset-2"
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
              >
                localhost:8025
              </a>{' '}
              to find it.
            </>
          )}
        </p>
        <Link
          href={signedIn ? '/account' : '/login'}
          className="mt-7 inline-flex h-11 items-center rounded bg-ink-950 px-6 text-sm font-semibold text-ink-25 transition-colors hover:bg-ink-800"
        >
          {signedIn ? 'Go to your account' : 'Go to sign in'}
        </Link>
      </div>
    );
  }

  const errors = form.formState.errors;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">
        <T id="ui.createAccount2" />
      </h1>
      <p className="mt-1.5 text-sm text-ink-600">
        <T id="ui.trackOrdersSaveAddressesGet" />
      </p>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="firstName"
            label={t('ui.firstName')}
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...form.register('firstName')}
          />
          <TextField
            id="lastName"
            label={t('ui.lastName')}
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...form.register('lastName')}
          />
        </div>
        <TextField
          id="email"
          label={t('ui.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          id="password"
          label={t('ui.password')}
          type="password"
          autoComplete="new-password"
          hint={t('ui.atLeast8CharactersWith')}
          error={errors.password?.message}
          {...form.register('password')}
        />

        <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm text-ink-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-xs border-ink-300 text-ink-950 focus:ring-ink-950"
            {...form.register('newsletterOptIn')}
          />
          <T id="ui.sendMeCampaignAnnouncements" />
        </label>

        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          <T id="ui.createAccount3" />
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-ink-950 underline decoration-ink-300 underline-offset-2 transition-colors hover:decoration-ink-950"
        >
          <T id="ui.sign" />
        </Link>
      </p>
    </div>
  );
}
