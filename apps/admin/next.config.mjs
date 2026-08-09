/**
 * Two build targets share this config, mirroring the storefront:
 *
 *  - Default (`output: 'standalone'`) — the Docker image used by
 *    docker-compose, talking to the NestJS API.
 *  - Demo (`NEXT_PUBLIC_DEMO_MODE=true` -> `output: 'export'`) — a fully static
 *    panel for Cloudflare Pages, backed by src/lib/demo instead of the API.
 */
const isDemoExport = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages-compatible choices mirror the storefront app; see
  // /infrastructure/cloudflare/admin-pages.md.
  images: { unoptimized: true },
  output: isDemoExport ? 'export' : 'standalone',
  // The demo build runs on Cloudflare's CI, where @outlet/eslint-config is not
  // part of the installed dependency subtree.
  eslint: { ignoreDuringBuilds: isDemoExport },
};

export default nextConfig;
