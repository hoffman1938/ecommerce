'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@outlet/validation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

function LoginInner() {
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
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your cart and its reservation timers carry over when you sign in.
      </p>
      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            {...form.register('email')}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          {form.formState.errors.email ? (
            <span className="text-xs text-red-600">{form.formState.errors.email.message}</span>
          ) : null}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:bg-gray-400"
        >
          Sign in
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-gray-500 hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="font-medium hover:underline">
          Create an account
        </Link>
      </div>
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
