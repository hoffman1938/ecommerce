'use client';

/**
 * Browser-side API client. The base URL comes exclusively from environment
 * configuration (NEXT_PUBLIC_API_BASE_URL) — never hardcoded — so the same
 * bundle works on localhost and on a future Cloudflare Pages deployment.
 * Cookies (session + cart) ride along via credentials: 'include'.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Demo mode replaces the network round-trip with the bundled catalog in
 * lib/demo. It exists so the storefront can be deployed to Cloudflare Pages,
 * which cannot host the NestJS API, PostgreSQL or Redis. With the flag unset
 * the client behaves exactly as before and talks to the real API.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { message?: string; code?: string; [key: string]: unknown },
  ) {
    super(body?.message ?? `API error ${status}`);
    this.name = 'ApiError';
  }
}

async function demoRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { demoRequest: resolve, DemoApiError } = await import('./demo/router');
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  try {
    return resolve(init.method ?? 'GET', path, body) as T;
  } catch (error) {
    if (error instanceof DemoApiError) {
      throw new ApiError(error.status, { message: error.message, code: 'DEMO_MODE' });
    }
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (DEMO_MODE) return demoRequest<T>(path, init);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
