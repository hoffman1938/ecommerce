'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { EMPTY_PRODUCT, ProductForm, toApiPayload, type ProductFormValues } from '@/components/product-form';

export default function NewProductPage() {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">New product</h1>
      <ProductForm
        values={values}
        onChange={setValues}
        submitLabel="Create product"
        error={error}
        onSubmit={async () => {
          setError(null);
          try {
            const product = await api.post<{ id: string }>('/admin/products', toApiPayload(values));
            router.push(`/products/${product.id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Create failed.');
          }
        }}
      />
    </div>
  );
}
