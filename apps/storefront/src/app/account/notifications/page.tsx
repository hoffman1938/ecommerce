'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface ProfileWithPrefs {
  notificationPreferences: {
    orderUpdates: boolean;
    campaignAnnouncements: boolean;
    newsletter: boolean;
  };
}

export default function NotificationsPage() {
  const { data: profile } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => api.get<ProfileWithPrefs>('/account/profile'),
  });
  const [prefs, setPrefs] = useState({
    orderUpdates: true,
    campaignAnnouncements: true,
    newsletter: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) setPrefs(profile.notificationPreferences);
  }, [profile]);

  const options = [
    ['orderUpdates', 'Order updates (confirmation, shipping, refunds)'],
    ['campaignAnnouncements', 'Campaign announcements'],
    ['newsletter', 'Newsletter'],
  ] as const;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">Notification preferences</h1>
      {saved ? <p className="mt-3 text-sm text-success-700">Preferences saved.</p> : null}
      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.patch('/account/notification-preferences', prefs);
          setSaved(true);
        }}
      >
        {options.map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded border border-ink-200 bg-ink-25 p-4 text-sm">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => {
                setSaved(false);
                setPrefs((p) => ({ ...p, [key]: e.target.checked }));
              }}
            />
            {label}
          </label>
        ))}
        <button className="rounded bg-ink-950 px-5 py-2.5 text-sm font-semibold text-ink-25 hover:bg-ink-800">
          Save preferences
        </button>
      </form>
    </div>
  );
}
