/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No Vercel-only features; asset domains are env-configurable; plain <img>
  // tags are used so no image-optimizer host allowlist is required. These
  // choices keep the app compatible with the Cloudflare Pages Next.js
  // adapter (see /infrastructure/cloudflare/storefront-pages.md).
  images: { unoptimized: true },
  output: 'standalone',
};

export default nextConfig;
