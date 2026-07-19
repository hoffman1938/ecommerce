# Storefront on Cloudflare Pages — build notes

The storefront was built to be compatible with the officially supported Cloudflare Next.js
deployment adapter (verify the current recommendation at deployment time — the ecosystem moves:
`@cloudflare/next-on-pages` or the newer OpenNext Cloudflare adapter).

Already satisfied by the code:

- No Vercel-only services; no hardcoded URLs — everything comes from `NEXT_PUBLIC_*` variables
- `images.unoptimized = true` (no Next image-optimizer server dependency); assets load from the
  configurable `NEXT_PUBLIC_ASSET_BASE_URL`
- No filesystem writes; uploads go from the admin browser to the API to object storage
- Server-only logic stays in server components/route handlers; personalized data is fetched
  client-side against the external API, so pages remain cacheable

Pages project settings (adapter-dependent, typical values):

```text
Root directory:    apps/storefront
Build command:     npx @cloudflare/next-on-pages@latest   (or the OpenNext build command)
Output directory:  .vercel/output/static                  (adapter-defined)
Node version:      20
```

Monorepo note: enable pnpm workspaces during build (Pages detects `pnpm-lock.yaml`; keep
`--frozen-lockfile` off until a lockfile is committed). Shared packages must build first —
use a build command that runs `pnpm -r --filter "./packages/**" build` before the app build.

Set the environment variables from `environment-variables.md` for Preview and Production
separately. Add `headers.example` / `redirects.example` contents as `_headers` / `_redirects`
in the output, or configure them in the dashboard.
