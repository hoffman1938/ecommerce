'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@outlet/ui';
import { api, API_BASE_URL } from '@/lib/api';
import { useAdminUser, hasPermission } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { T } from '@/components/t';

interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  outletPriceMinor: number;
  originalPriceMinor: number;
  brand: { name: string };
  variants: Array<{
    id: string;
    inventory: { onHandQuantity: number; reservedQuantity: number } | null;
  }>;
}

export default function AdminProductsPage() {
  const { t, money } = useI18n();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  /*
   * Which controls this role can actually use, the way the reviews screen
   * already does it.
   *
   * `products.view` is enough to open this screen, and an Inventory Manager has
   * exactly that — so New product, Import CSV and the status dropdown were all
   * on offer to someone the API refuses. A button that returns 403 to the only
   * role it is shown to is worse than an absent one: it reads as a broken panel
   * rather than as a permission they do not hold. Export stays: it needs nothing
   * beyond `products.view`.
   *
   * Hiding is presentation, not enforcement — every one of these is still
   * checked server-side by the Worker.
   */
  const { data: me } = useAdminUser();
  const canCreate = hasPermission(me?.user, 'products.create');
  const canUpdate = hasPermission(me?.user, 'products.update');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', q, page],
    queryFn: () =>
      api.get<{ items: AdminProduct[]; total: number; totalPages: number }>(
        `/admin/products?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          <T id="ui.products" />
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`${API_BASE_URL}/admin/products/export/csv`}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            <T id="ui.exportCsv" />
          </a>
          {canCreate ? (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
              >
                <T id="ui.importCsv" />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const csv = await file.text();
                  try {
                    const result = await api.post<{ created: number; skipped: number }>(
                      '/admin/products/import/csv',
                      { csv },
                    );
                    setImportResult(
                      `Imported ${result.created} variants (${result.skipped} skipped).`,
                    );
                    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
                  } catch (err) {
                    setImportResult(`Import failed: ${(err as Error).message}`);
                  }
                  e.target.value = '';
                }}
              />
              <Link
                href="/products/new"
                data-testid="new-product"
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                <T id="ui.newProduct" />
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {importResult ? <p className="mb-3 text-sm text-gray-600">{importResult}</p> : null}

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder={t('ui.searchByNameSlugSku')}
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <T id="ui.product" />
              </th>
              <th>Brand</th>
              <th>
                <T id="ui.status" />
              </th>
              <th className="text-right">
                <T id="ui.price" />
              </th>
              <th className="text-right">Variants</th>
              <th className="text-right">Available</th>
              <th className="text-right">Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-gray-400">
                  <T id="ui.loading" />
                </td>
              </tr>
            ) : (
              (data?.items ?? []).map((product) => {
                const available = product.variants.reduce(
                  (sum, v) =>
                    sum +
                    Math.max(
                      0,
                      (v.inventory?.onHandQuantity ?? 0) - (v.inventory?.reservedQuantity ?? 0),
                    ),
                  0,
                );
                return (
                  <tr key={product.id}>
                    <td>
                      <Link
                        href={`/products/view?id=${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="block font-mono text-xs text-gray-400">{product.slug}</span>
                    </td>
                    <td>{product.brand.name}</td>
                    <td>
                      <Badge
                        tone={
                          product.status === 'ACTIVE'
                            ? 'green'
                            : product.status === 'ARCHIVED'
                              ? 'red'
                              : 'gray'
                        }
                      >
                        {product.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {money(product.outletPriceMinor)}
                      <span className="block text-xs text-gray-400 line-through">
                        {money(product.originalPriceMinor)}
                      </span>
                    </td>
                    <td className="text-right">{product.variants.length}</td>
                    <td
                      className={`text-right font-semibold ${available === 0 ? 'text-red-600' : ''}`}
                    >
                      {available}
                    </td>
                    {/* Status is changed from the list as well as the editor:
                        publishing and archiving is what moves a category on and
                        off the storefront, and it is not worth a page load. */}
                    <td className="text-right">
                      <select
                        value={product.status}
                        // Read-only for a role that may look but not publish, so
                        // the control still reports the status without offering a
                        // change the API would refuse.
                        disabled={!canUpdate}
                        aria-label={`Status for ${product.name}`}
                        data-testid={`status-${product.slug}`}
                        onChange={async (event) => {
                          const status = event.target.value;
                          try {
                            await api.put(`/admin/products/${product.id}`, { status });
                            queryClient.invalidateQueries({ queryKey: ['admin-products'] });
                            queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
                          } catch (err) {
                            setImportResult(`Could not update: ${(err as Error).message}`);
                          }
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        {['DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED'].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border px-3 py-1.5 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-gray-500">
            Page {page} / {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1.5 disabled:opacity-40"
          >
            <T id="ui.next2" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
