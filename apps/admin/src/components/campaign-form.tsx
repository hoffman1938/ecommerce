'use client';
import { T } from '@/components/t';

export interface CampaignFormValues {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'ARCHIVED';
  position: number;
  isVisible: boolean;
  seoTitle: string;
  seoDescription: string;
}

export const EMPTY_CAMPAIGN: CampaignFormValues = {
  title: '',
  slug: '',
  shortDescription: '',
  description: '',
  startsAt: '',
  endsAt: '',
  status: 'DRAFT',
  position: 0,
  isVisible: true,
  seoTitle: '',
  seoDescription: '',
};

export function toCampaignPayload(values: CampaignFormValues) {
  return {
    ...values,
    shortDescription: values.shortDescription || null,
    description: values.description || null,
    seoTitle: values.seoTitle || null,
    seoDescription: values.seoDescription || null,
    startsAt: new Date(values.startsAt).toISOString(),
    endsAt: new Date(values.endsAt).toISOString(),
  };
}

export function CampaignForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  error,
}: {
  values: CampaignFormValues;
  onChange: (values: CampaignFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  error: string | null;
}) {
  const set = <K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <form
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Title</span>
          <input
            required
            value={values.title}
            onChange={(e) => {
              const title = e.target.value;
              onChange({
                ...values,
                title,
                slug:
                  values.slug ||
                  title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, ''),
              });
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            data-testid="campaign-title"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Slug</span>
          <input
            required
            value={values.slug}
            onChange={(e) => set('slug', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium"><T id="ui.startsAt" /></span>
          <input
            type="datetime-local"
            required
            value={values.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            data-testid="campaign-starts"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium"><T id="ui.endsAt" /></span>
          <input
            type="datetime-local"
            required
            value={values.endsAt}
            onChange={(e) => set('endsAt', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            data-testid="campaign-ends"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium"><T id="ui.status" /></span>
          <select
            value={values.status}
            onChange={(e) => set('status', e.target.value as CampaignFormValues['status'])}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium"><T id="ui.displayOrder" /></span>
          <input
            type="number"
            value={values.position}
            onChange={(e) => set('position', Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium"><T id="ui.shortDescription" /></span>
          <input
            value={values.shortDescription}
            onChange={(e) => set('shortDescription', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium"><T id="ui.fullDescription" /></span>
          <textarea
            rows={3}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isVisible}
            onChange={(e) => set('isVisible', e.target.checked)}
          /><T id="ui.visibleStorefront" /></label>
      </div>
      <button
        data-testid="save-campaign"
        className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
      >
        {submitLabel}
      </button>
    </form>
  );
}
