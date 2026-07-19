/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages-compatible choices mirror the storefront app; see
  // /infrastructure/cloudflare/admin-pages.md.
  images: { unoptimized: true },
  output: 'standalone',
};

export default nextConfig;
