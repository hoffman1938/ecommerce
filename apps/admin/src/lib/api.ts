'use client';

/** Admin panel API client — same environment-driven pattern as the storefront. */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Demo mode replaces the network round-trip with a client-side store, exactly
 * as the storefront does. It exists so the panel can be deployed to Cloudflare
 * Pages, which cannot host the NestJS API, PostgreSQL or Redis. With the flag
 * unset the client behaves as before and talks to the real API.
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
      throw new ApiError(error.status, {
        message: error.message,
        code: error.code ?? 'DEMO_MODE',
      });
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
      ...(init.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const text = await response.text();
  const body = isJson && text ? JSON.parse(text) : { raw: text };
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getText: (path: string) =>
    DEMO_MODE
      ? Promise.resolve('')
      : fetch(`${API_BASE_URL}${path}`, { credentials: 'include' }).then((r) => r.text()),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
