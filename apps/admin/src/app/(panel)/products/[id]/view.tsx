'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  EMPTY_PRODUCT,
  ProductForm,
  toApiPayload,
  type ProductFormValues,
} from '@/components/product-form';

interface AdminVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  priceOverrideMinor: number | null;
  isEnabled: boolean;
  inventory: { onHandQuantity: number; reservedQuantity: number } | null;
}

interface AdminProductDetail extends ProductFormValues {
  id: string;
  variants: AdminVariant[];
  images: Array<{ id: string; url: string; altText: string | null }>;
  brandId: string;
}

export default function EditProductPage() {
  const { money } = useI18n();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newVariant, setNewVariant] = useState({
    sku: '',
    size: '',
    color: '',
    initialQuantity: 0,
  });

  const { data: product } = useQuery({
    queryKey: ['admin-product', params.id],
    queryFn: () => api.get<AdminProductDetail>(`/admin/products/${params.id}`),
  });

  useEffect(() => {
    if (product) {
      setValues({
        name: product.name,
        slug: product.slug,
        brandId: product.brandId,
        categoryId: (product as unknown as { categoryId: string | null }).categoryId ?? '',
        shortDescription: product.shortDescription ?? '',
        description: product.description ?? '',
        targetGroup: product.targetGroup,
        materials: product.materials ?? '',
        careInstructions: product.careInstructions ?? '',
        countryOfOrigin: product.countryOfOrigin ?? '',
        originalPriceMinor: product.originalPriceMinor,
        outletPriceMinor: product.outletPriceMinor,
        taxClass: product.taxClass,
        status: product.status,
        seoTitle: product.seoTitle ?? '',
        seoDescription: product.seoDescription ?? '',
        searchKeywords: product.searchKeywords ?? '',
      });
    }
  }, [product]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-product', params.id] });

  if (!product) return <p className="text-gray-500">Loading product…</p>;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              const copy = await api.post<{ id: string }>(
                `/admin/products/${product.id}/duplicate`,
              );
              window.location.href = `/products/${copy.id}`;
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.post(`/admin/products/${product.id}/archive`);
              refresh();
            }}
            className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-600 hover:border-red-600"
          >
            Archive
          </button>
        </div>
      </div>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}

      <ProductForm
        values={values}
        onChange={setValues}
        submitLabel="Save changes"
        error={error}
        onSubmit={async () => {
          setError(null);
          setMessage(null);
          try {
            await api.put(`/admin/products/${product.id}`, toApiPayload(values));
            setMessage('Product saved.');
            refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Save failed.');
          }
        }}
      />

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Variants</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Size</th>
              <th>Color</th>
              <th className="text-right">On hand</th>
              <th className="text-right">Reserved</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id}>
                <td className="font-mono text-xs">{variant.sku}</td>
                <td>{variant.size ?? '—'}</td>
                <td>{variant.color ?? '—'}</td>
                <td className="text-right">{variant.inventory?.onHandQuantity ?? 0}</td>
                <td className="text-right">{variant.inventory?.reservedQuantity ?? 0}</td>
                <td>
                  <Badge tone={variant.isEnabled ? 'green' : 'gray'}>
                    {variant.isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/admin/variants/${variant.id}/enabled`, {
                        isEnabled: !variant.isEnabled,
                      });
                      refresh();
                    }}
                    className="text-xs text-gray-500 underline"
                  >
                    {variant.isEnabled ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api.post(`/admin/products/${product.id}/variants`, {
                sku: newVariant.sku,
                size: newVariant.size || null,
                color: newVariant.color || null,
                initialQuantity: newVariant.initialQuantity,
              });
              setNewVariant({ sku: '', size: '', color: '', initialQuantity: 0 });
              refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Variant create failed.');
            }
          }}
        >
          {(
            [
              ['sku', 'SKU', 'text'],
              ['size', 'Size', 'text'],
              ['color', 'Color', 'text'],
              ['initialQuantity', 'Initial qty', 'number'],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
              <input
                type={type}
                required={key === 'sku'}
                value={newVariant[key] as string | number}
                onChange={(e) =>
                  setNewVariant((v) => ({
                    ...v,
                    [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
                className="w-32 rounded-md border border-gray-300 px-2 py-1.5"
                data-testid={`variant-${key}`}
              />
            </label>
          ))}
          <button
            data-testid="add-variant"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Add variant
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Images (stored in MinIO)</h2>
        <div className="flex flex-wrap gap-3">
          {product.images.map((image) => (
            <div key={image.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.altText ?? ''}
                className="h-24 w-24 rounded border object-cover"
              />
              <button
                type="button"
                onClick={async () => {
                  await api.delete(`/admin/products/${product.id}/images/${image.id}`);
                  refresh();
                }}
                className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Upload image (PNG/JPEG/WebP/SVG, max 5 MB)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            data-testid="image-upload"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError(null);
              try {
                const form = new FormData();
                form.append('file', file);
                const uploaded = await api.postForm<{ url: string; objectKey: string }>(
                  '/admin/uploads',
                  form,
                );
                await api.post(`/admin/products/${product.id}/images`, {
                  url: uploaded.url,
                  objectKey: uploaded.objectKey,
                  altText: product.name,
                });
                setMessage('Image uploaded to object storage.');
                refresh();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Upload failed.');
              }
              e.target.value = '';
            }}
          />
        </label>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">
        Outlet price {money(product.outletPriceMinor)} vs original{' '}
        {money(product.originalPriceMinor)}.
      </section>
    </div>
  );
}
