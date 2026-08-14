/**
 * Three build targets share this config, mirroring the storefront:
 *
 *  - Default (`output: 'standalone'`) — the Docker image used by
 *    docker-compose, talking to the NestJS API.
 *  - Cloudflare (`STATIC_EXPORT=true` -> `output: 'export'`) — a static panel
 *    for Pages, talking to the Cloudflare Worker API at
 *    NEXT_PUBLIC_API_BASE_URL. Every administrative action is authorised
 *    server-side by that Worker, so the panel being static changes nothing
 *    about who is allowed to do what.
 *  - Bundled demo (`NEXT_PUBLIC_DEMO_MODE=true`) — the same export backed by
 *    src/lib/demo, for a preview built before the Worker exists.
 */
const isDemoExport = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const isStaticExport = isDemoExport || process.env.STATIC_EXPORT === 'true';

/**
 * Serve the panel under a sub-path (`ADMIN_BASE_PATH=/admin`) so the demo build
 * can be nested inside the storefront's export and share one Pages project and
 * one domain. Next rewrites its own links, router pushes and asset URLs to
 * match, so nothing in the app needs to know.
 *
 * Unset — the default — the panel owns the domain root, which is what a
 * standalone deployment wants.
 */
const basePath = process.env.ADMIN_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  // Cloudflare Pages-compatible choices mirror the storefront app; see
  // /infrastructure/cloudflare/admin-pages.md.
  images: { unoptimized: true },
  output: isStaticExport ? 'export' : 'standalone',
  // The Cloudflare build runs on Pages' CI, where @outlet/eslint-config is not
  // part of the installed dependency subtree.
  eslint: { ignoreDuringBuilds: isStaticExport },
};

export default nextConfig;
