/**
 * Server-side fetch helper for React Server Components (public data only —
 * personalized data is fetched client-side with the user's cookies).
 * Inside Docker the API is reached via the internal network hostname.
 *
 * In demo mode (NEXT_PUBLIC_DEMO_MODE=true, used for the Cloudflare Pages
 * build) the same paths resolve against the bundled catalog instead, so the
 * static export renders real content with no API running.
 */
const SERVER_API_BASE =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export async function serverGet<T>(path: string): Promise<T | null> {
  if (DEMO_MODE) {
    const { demoRequest } = await import('./demo/router');
    try {
      return demoRequest('GET', path) as T;
    } catch {
      return null;
    }
  }

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
