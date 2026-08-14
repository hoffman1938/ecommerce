/**
 * Server-side fetch helper for React Server Components (public data only —
 * personalized data is fetched client-side with the user's cookies).
 *
 * Three modes, matching the three build targets in next.config.mjs:
 *
 *  - Bundled demo (NEXT_PUBLIC_DEMO_MODE=true) — resolves against the
 *    catalogue compiled into the bundle, with no API at all.
 *  - Static export (STATIC_EXPORT=true) — fetches from the Worker API *at
 *    build time* and bakes the result into the exported HTML.
 *  - Server (the Docker image) — fetches per request, uncached, so a running
 *    site never serves a stale catalogue.
 */
const SERVER_API_BASE =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const STATIC_EXPORT = process.env.STATIC_EXPORT === 'true';

/**
 * `no-store` is what a long-running server wants, and it is exactly wrong for
 * a static export: in the App Router it opts the route into dynamic rendering,
 * and `output: 'export'` cannot emit a dynamic route — so the page is silently
 * left out of `out/` and the deployed site 404s at that path. The homepage
 * disappearing from the export is precisely how this was found.
 *
 * During an export the fetch is therefore cached, which is the honest
 * description of what a build-time fetch is: a snapshot.
 */
const CACHE_MODE: RequestCache = STATIC_EXPORT ? 'force-cache' : 'no-store';

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
    const response = await fetch(`${SERVER_API_BASE}${path}`, { cache: CACHE_MODE });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // A build with no API reachable still produces a site; the sections that
    // needed data render their empty state rather than failing the build.
    return null;
  }
}
