# Admin panel on Cloudflare Pages — build notes

Identical adapter story to the storefront (`storefront-pages.md`); separate Pages project with its
own build configuration, environment variables, and access controls.

```text
Root directory:    apps/admin
Build command:     npx @cloudflare/next-on-pages@latest   (or the OpenNext build command)
Output directory:  adapter-defined
Node version:      20
```

Recommended hardening for the admin project:

- Put the admin domain behind **Cloudflare Access** (Zero Trust) in addition to the app's own
  RBAC login — defense in depth for a back-office surface.
- Robots are already disabled via metadata; also add an `X-Robots-Tag: noindex` header
  (see `headers.example`).
- Restrict `TRUSTED_ORIGINS` on the API to the exact admin origin.
- The admin app is fully client-rendered behind its login; no SPA fallback rules are needed with
  the Next.js adapter (it emits its own routing). If you ever export it purely statically, add a
  `/* /index.html 200` fallback in `_redirects`.
