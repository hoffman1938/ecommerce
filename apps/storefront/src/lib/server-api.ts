/**
 * Server-side fetch helper for React Server Components (public data only —
 * personalized data is fetched client-side with the user's cookies).
 * Inside Docker the API is reached via the internal network hostname.
 */
const SERVER_API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${SERVER_API_BASE}${path}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
