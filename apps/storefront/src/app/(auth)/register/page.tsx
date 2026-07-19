'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@outlet/validation';
import { api, ApiError } from '@/lib/api';

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterInput) => {
    setError(null);
    try {
      await api.post('/auth/register', values);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed.');
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-gray-600">
          We sent a verification link to your address. In local development, open Mailpit at{' '}
          <a className="underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
            localhost:8025
          </a>{' '}
          to find it.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const errors = form.formState.errors;
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Create your account</h1>
      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">First name</span>
            <input {...form.register('firstName')} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            {errors.firstName ? <span className="text-xs text-red-600">{errors.firstName.message}</span> : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Last name</span>
            <input {...form.register('lastName')} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            {errors.lastName ? <span className="text-xs text-red-600">{errors.lastName.message}</span> : null}
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input type="email" autoComplete="email" {...form.register('email')} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          {errors.email ? <span className="text-xs text-red-600">{errors.email.message}</span> : null}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Password</span>
          <input type="password" autoComplete="new-password" {...form.register('password')} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          {errors.password ? <span className="text-xs text-red-600">{errors.password.message}</span> : null}
          <span className="mt-1 block text-xs text-gray-500">
            At least 8 characters with upper- and lowercase letters and a digit.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register('newsletterOptIn')} />
          Send me campaign announcements
        </label>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:bg-gray-400"
        >
          Create account
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        Already registered?{' '}
        <Link href="/login" className="font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
