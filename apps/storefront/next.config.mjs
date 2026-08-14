/**
 * Three build targets share this config:
 *
 *  - Default (`output: 'standalone'`) — the Docker image used by
 *    docker-compose, talking to the NestJS API over the internal network.
 *  - Cloudflare (`STATIC_EXPORT=true` -> `output: 'export'`) — a static site
 *    for Pages, fetching from the Cloudflare Worker API at
 *    NEXT_PUBLIC_API_BASE_URL. Pages are pre-rendered at build time against
 *    that API, so the deployed HTML ships with real catalogue data in it and
 *    every interaction afterwards is live against D1.
 *  - Bundled demo (`NEXT_PUBLIC_DEMO_MODE=true` -> `output: 'export'`) — the
 *    same static export, but reading the catalogue bundled into the client
 *    instead of any API. Kept as the fallback for a preview built before the
 *    Worker exists; it can browse but cannot place an order.
 *
 * The route list for the export comes from the shared catalogue in either
 * case, so both builds enumerate the same pages.
 */
const isDemoExport = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const isStaticExport = isDemoExport || process.env.STATIC_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No Vercel-only features; asset domains are env-configurable; plain <img>
  // tags are used so no image-optimizer host allowlist is required. These
  // choices keep the app compatible with the Cloudflare Pages Next.js
  // adapter (see /infrastructure/cloudflare/storefront-pages.md).
  images: { unoptimized: true },
  output: isStaticExport ? 'export' : 'standalone',
  // The Cloudflare build runs on Pages' CI, where @outlet/eslint-config is not
  // part of the installed dependency subtree. Linting still runs in the normal
  // build and via `pnpm lint`; skipping it here only affects the static export.
  eslint: { ignoreDuringBuilds: isStaticExport },
};

export default nextConfig;
