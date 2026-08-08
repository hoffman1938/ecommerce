'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Profile {
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => api.get<Profile>('/account/profile'),
  });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
    }
  }, [profile]);

  if (!profile) return <p className="text-ink-500">Loading…</p>;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">Personal information</h1>
      <p className="mt-1 text-sm text-ink-500">
        {profile.email} {profile.isEmailVerified ? '· verified ✓' : '· not verified'}
      </p>
      {message ? <p className="mt-4 text-sm text-success-700">{message}</p> : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.patch('/account/profile', { firstName, lastName });
          queryClient.invalidateQueries({ queryKey: ['me'] });
          setMessage('Profile updated.');
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded border border-ink-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Last name</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded border border-ink-300 px-3 py-2"
          />
        </label>
        <button className="rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25 hover:bg-ink-800">
          Save changes
        </button>
      </form>
    </div>
  );
}
