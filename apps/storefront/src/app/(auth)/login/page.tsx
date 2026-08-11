'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@outlet/validation';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, TextField } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { T } from '@/components/t';
import { useI18n } from '@/lib/i18n';

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginInput) => {
    setError(null);
    try {
      await api.post('/auth/login', values);
      await queryClient.invalidateQueries();
      router.push(params.get('next') ?? '/account');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">
        <T id="ui.sign" />
      </h1>
      <p className="mt-1.5 text-sm text-ink-600">
        <T id="ui.bagItsReservationTimersCarry" />
      </p>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
        <TextField
          id="email"
          label={t('ui.email')}
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <div>
          <TextField
            id="password"
            label={t('ui.password')}
            type="password"
            autoComplete="current-password"
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
            >
              <T id="ui.forgotPassword" />
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          <T id="ui.sign" />
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-600">
        {t('ui.newHere')}{' '}
        <Link
          href="/register"
          className="font-medium text-ink-950 underline underline-offset-2 decoration-ink-300 transition-colors hover:decoration-ink-950"
        >
          <T id="ui.createAccount" />
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
