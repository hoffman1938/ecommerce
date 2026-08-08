/**
 * Two build targets share this config:
 *
 *  - Default (`output: 'standalone'`) — the Docker image used by
 *    docker-compose, talking to the NestJS API over the internal network.
 *  - Demo (`NEXT_PUBLIC_DEMO_MODE=true` -> `output: 'export'`) — a fully static
 *    site for Cloudflare Pages, which has no Node server to render on. Data
 *    comes from the bundled catalog in src/lib/demo instead of the API.
 */
const isDemoExport = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No Vercel-only features; asset domains are env-configurable; plain <img>
  // tags are used so no image-optimizer host allowlist is required. These
  // choices keep the app compatible with the Cloudflare Pages Next.js
  // adapter (see /infrastructure/cloudflare/storefront-pages.md).
  images: { unoptimized: true },
  output: isDemoExport ? 'export' : 'standalone',
  // The demo build runs on Cloudflare's CI, where @outlet/eslint-config is not
  // part of the installed dependency subtree. Linting still runs in the normal
  // build and via `pnpm lint`; skipping it here only affects the demo export.
  eslint: { ignoreDuringBuilds: isDemoExport },
};

export default nextConfig;
