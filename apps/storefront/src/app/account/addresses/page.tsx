'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SavedAddress {
  id: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  countryCode: string;
  phone: string | null;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

const EMPTY = {
  firstName: '',
  lastName: '',
  line1: '',
  city: '',
  postalCode: '',
  countryCode: 'DE',
  phone: '',
};

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const { data: addresses } = useQuery({
    queryKey: ['account-addresses'],
    queryFn: () => api.get<SavedAddress[]>('/account/addresses'),
  });
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['account-addresses'] });

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Saved addresses</h1>
      <div className="space-y-3">
        {(addresses ?? []).map((address) => (
          <div key={address.id} className="rounded border border-ink-200 bg-ink-25 p-4 text-sm">
            <p className="font-medium">
              {address.firstName} {address.lastName}
              {address.isDefaultShipping ? (
                <span className="ml-2 text-xs text-ink-500">Default shipping</span>
              ) : null}
            </p>
            <p className="text-ink-600">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
              <br />
              {address.postalCode} {address.city}, {address.countryCode}
            </p>
            <button
              type="button"
              onClick={async () => {
                await api.delete(`/account/addresses/${address.id}`);
                refresh();
              }}
              className="mt-2 text-xs text-ink-500 underline"
            >
              Delete
            </button>
          </div>
        ))}
        {addresses && addresses.length === 0 ? (
          <p className="text-sm text-ink-500">No saved addresses yet.</p>
        ) : null}
      </div>

      {showForm ? (
        <form
          className="mt-6 space-y-3 rounded border border-ink-200 bg-ink-25 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api.post('/account/addresses', {
                ...form,
                phone: form.phone || null,
                type: 'BOTH',
                isDefaultShipping: (addresses ?? []).length === 0,
                isDefaultBilling: (addresses ?? []).length === 0,
              });
              setForm(EMPTY);
              setShowForm(false);
              refresh();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          {error ? <p className="text-sm text-sale-500">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['line1', 'Street and number'],
                ['city', 'City'],
                ['postalCode', 'Postal code'],
                ['countryCode', 'Country code'],
                ['phone', 'Phone (optional)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={`block text-sm ${key === 'line1' ? 'col-span-2' : ''}`}>
                <span className="mb-1 block font-medium">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full rounded border border-ink-300 px-3 py-2"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button className="rounded bg-ink-950 px-4 py-2 text-sm font-semibold text-ink-25">
              Save address
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-ink-500 underline"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-6 rounded border border-ink-950 px-4 py-2 text-sm font-semibold hover:bg-ink-950 hover:text-ink-25"
        >
          Add a new address
        </button>
      )}
    </div>
  );
}
