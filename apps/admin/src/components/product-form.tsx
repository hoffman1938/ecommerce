'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProductFormValues {
  name: string;
  slug: string;
  brandId: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  targetGroup: 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';
  materials: string;
  careInstructions: string;
  countryOfOrigin: string;
  originalPriceMinor: number;
  outletPriceMinor: number;
  taxClass: 'STANDARD' | 'REDUCED' | 'ZERO';
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  seoTitle: string;
  seoDescription: string;
  searchKeywords: string;
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: '',
  slug: '',
  brandId: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  targetGroup: 'UNISEX',
  materials: '',
  careInstructions: '',
  countryOfOrigin: '',
  originalPriceMinor: 0,
  outletPriceMinor: 0,
  taxClass: 'STANDARD',
  status: 'DRAFT',
  seoTitle: '',
  seoDescription: '',
  searchKeywords: '',
};

export function toApiPayload(values: ProductFormValues) {
  return {
    ...values,
    categoryId: values.categoryId || null,
    shortDescription: values.shortDescription || null,
    description: values.description || null,
    materials: values.materials || null,
    careInstructions: values.careInstructions || null,
    countryOfOrigin: values.countryOfOrigin || null,
    seoTitle: values.seoTitle || null,
    seoDescription: values.seoDescription || null,
    searchKeywords: values.searchKeywords || null,
  };
}

export function ProductForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  error,
}: {
  values: ProductFormValues;
  onChange: (values: ProductFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  error: string | null;
}) {
  const { data: brands } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/admin/brands'),
  });
  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/admin/categories'),
  });
  const [autoSlug, setAutoSlug] = useState(!values.slug);

  useEffect(() => {
    if (autoSlug && values.name) {
      onChange({
        ...values,
        slug: values.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.name, autoSlug]);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const text = (key: keyof ProductFormValues, label: string, span2 = false) => (
    <label className={`block text-sm ${span2 ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block font-medium">{label}</span>
      <input
        value={String(values[key] ?? '')}
        onChange={(e) => set(key, e.target.value as never)}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
    </label>
  );

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
        {text('name', 'Name', true)}
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 flex justify-between font-medium">
            Slug
            <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
              <input
                type="checkbox"
                checked={autoSlug}
                onChange={(e) => setAutoSlug(e.target.checked)}
              />
              auto
            </label>
          </span>
          <input
            value={values.slug}
            onChange={(e) => {
              setAutoSlug(false);
              set('slug', e.target.value);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Brand</span>
          <select
            value={values.brandId}
            onChange={(e) => set('brandId', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            required
          >
            <option value="">Select…</option>
            {(brands ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Category</span>
          <select
            value={values.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="">None</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Target group</span>
          <select
            value={values.targetGroup}
            onChange={(e) => set('targetGroup', e.target.value as ProductFormValues['targetGroup'])}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {['UNISEX', 'MEN', 'WOMEN', 'KIDS'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select
            value={values.status}
            onChange={(e) => set('status', e.target.value as ProductFormValues['status'])}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {['DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Original price (minor units, e.g. 2995)</span>
          <input
            type="number"
            min={1}
            value={values.originalPriceMinor || ''}
            onChange={(e) => set('originalPriceMinor', Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Outlet price (minor units)</span>
          <input
            type="number"
            min={1}
            value={values.outletPriceMinor || ''}
            onChange={(e) => set('outletPriceMinor', Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            required
            data-testid="outlet-price"
          />
        </label>
        {text('shortDescription', 'Short description', true)}
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Description</span>
          <textarea
            rows={4}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        {text('materials', 'Materials')}
        {text('careInstructions', 'Care instructions')}
        {text('countryOfOrigin', 'Country of origin')}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tax class</span>
          <select
            value={values.taxClass}
            onChange={(e) => set('taxClass', e.target.value as ProductFormValues['taxClass'])}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {['STANDARD', 'REDUCED', 'ZERO'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {text('seoTitle', 'SEO title')}
        {text('seoDescription', 'SEO description')}
        {text('searchKeywords', 'Search keywords', true)}
      </div>
      <button
        type="submit"
        data-testid="save-product"
        className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
      >
        {submitLabel}
      </button>
    </form>
  );
}
