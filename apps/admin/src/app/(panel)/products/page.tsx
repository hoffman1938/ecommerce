'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, Badge } from '@outlet/ui';
import { api, API_BASE_URL } from '@/lib/api';

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
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

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
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`${API_BASE_URL}/admin/products/export/csv`}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            Export CSV
          </a>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-900"
          >
            Import CSV
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
                setImportResult(`Imported ${result.created} variants (${result.skipped} skipped).`);
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
            New product
          </Link>
        </div>
      </div>
      {importResult ? <p className="mb-3 text-sm text-gray-600">{importResult}</p> : null}

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Search by name, slug, or SKU…"
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Status</th>
              <th className="text-right">Price</th>
              <th className="text-right">Variants</th>
              <th className="text-right">Available</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-gray-400">
                  Loading…
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
                        href={`/products/${product.id}`}
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
                      {formatMoney(product.outletPriceMinor)}
                      <span className="block text-xs text-gray-400 line-through">
                        {formatMoney(product.originalPriceMinor)}
                      </span>
                    </td>
                    <td className="text-right">{product.variants.length}</td>
                    <td
                      className={`text-right font-semibold ${available === 0 ? 'text-red-600' : ''}`}
                    >
                      {available}
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
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
