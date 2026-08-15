#!/usr/bin/env node
/**
 * `pnpm build:cloudflare`
 *
 * Builds the static export Cloudflare Pages serves: the storefront, with the
 * admin panel nested at /admin so both ship from one project on one domain.
 *
 * Which backend the export talks to depends on one variable:
 *
 *   API_BASE_URL set    the pages are pre-rendered against the Cloudflare
 *                       Worker API and every interaction afterwards is live
 *                       against D1. This is the real demo.
 *
 *   API_BASE_URL unset  refused, unless ALLOW_MOCK_BUILD=true asks for the
 *                       bundled-catalogue fallback. That export browses but has
 *                       no database behind it, so nothing can be bought and the
 *                       admin panel accepts any password — a deploy that
 *                       silently degraded to it is the failure this script
 *                       exists to prevent.
 *
 * This is a script rather than an inline `FOO=bar next build` in package.json
 * because that syntax is a shell-ism: it works in the Linux container Pages
 * builds in and fails on a Windows developer machine, which is the sort of
 * thing that only surfaces when someone tries to reproduce a deploy locally.
 */
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = [
  '@outlet/types',
  '@outlet/catalog',
  '@outlet/domain',
  '@outlet/validation',
  '@outlet/ui',
];

const STOREFRONT_OUT = join('apps', 'storefront', 'out');
const ADMIN_OUT = join('apps', 'admin', 'out');
const ADMIN_NESTED = join(STOREFRONT_OUT, 'admin');

const apiBaseUrl = (process.env.API_BASE_URL ?? '').replace(/\/+$/, '');
const apiBacked = apiBaseUrl !== '';

// Run through a shell: on Windows `pnpm` is a .cmd shim, which Node refuses to
// spawn directly. Every argument here is a literal from this file, so there is
// nothing interpolated for a shell to reinterpret.
const run = (command, env) => {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
};

/*
 * A warning is not enough here.
 *
 * The bundled-catalogue fallback produces a site that looks complete and is
 * not: its admin panel accepts any password, and every write reports that it
 * needs a database. A Pages build that quietly landed there is exactly how
 * this project came to have a published demo nobody could sign in to — the
 * warning was printed, and build logs are not read when a build succeeds.
 *
 * So the fallback is now opt-in. Ask for it and you get it; forget to set
 * API_BASE_URL and the build stops instead of shipping the mock.
 */
const allowMock = process.env.ALLOW_MOCK_BUILD === 'true';

if (apiBacked) {
  console.log(`Building against the Worker API at ${apiBaseUrl}`);
} else if (allowMock) {
  console.warn(
    [
      '',
      '='.repeat(78),
      'Building the bundled-catalogue fallback (ALLOW_MOCK_BUILD=true).',
      '',
      'This export browses, but there is no database behind it: sign-in, cart,',
      'checkout and every admin write are inoperative. Do not publish it as a',
      'demo of the product.',
      '='.repeat(78),
      '',
    ].join('\n'),
  );
} else {
  console.error(
    [
      '',
      '='.repeat(78),
      'API_BASE_URL is not set — refusing to build.',
      '',
      'Without it this script produces the bundled-catalogue export: browsable,',
      'but with no database, so sign-in, cart, checkout and every admin write',
      'do not work. Published, it reads as a broken product rather than as a',
      'deliberate preview.',
      '',
      'Deploy the Worker and point the build at it:',
      '',
      '    API_BASE_URL=https://outlet-demo-api.<subdomain>.workers.dev',
      '',
      'In Cloudflare Pages that goes in Settings -> Environment variables.',
      'See infrastructure/cloudflare/d1-and-r2.md.',
      '',
      'If the catalogue-only export really is what you want, ask for it:',
      '',
      '    ALLOW_MOCK_BUILD=true',
      '='.repeat(78),
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/**
 * The two ways the front ends learn where their data lives.
 *
 * NEXT_PUBLIC_API_BASE_URL is baked into the client bundle and used by the
 * browser; API_INTERNAL_URL is read by the server components during the build
 * so pre-rendered pages ship with real content. Both point at the same public
 * Worker — there is no private network here, and nothing secret in either.
 */
const apiEnv = apiBacked
  ? {
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      API_INTERNAL_URL: apiBaseUrl,
      STATIC_EXPORT: 'true',
      /*
       * Set explicitly, not merely left unset. Next.js reads apps/*\/.env.local
       * during a build, and a developer who has ever run the bundled demo has
       * NEXT_PUBLIC_DEMO_MODE=true sitting in one — which would switch the
       * client back to the mock store while every other signal here says the
       * build is API-backed. Naming it false means the environment decides and
       * a leftover file cannot.
       */
      NEXT_PUBLIC_DEMO_MODE: 'false',
      /*
       * Which backend the front ends are talking to, so they can stop guessing
       * from the API's hostname — the Worker runs on localhost too when you
       * develop against it, which is exactly what a host check gets wrong.
       *
       * The pages that branch on it are the ones making a claim that is only
       * true of one backend: "a confirmation email has been sent, check
       * Mailpit" (the Docker stack does; this does not, it writes to the
       * account's mailbox), and the admin sign-in hint naming the Postgres
       * seed's credentials (which do not exist in D1). The Docker build leaves
       * this unset.
       */
      NEXT_PUBLIC_BACKEND: 'edge',
    }
  : { NEXT_PUBLIC_DEMO_MODE: 'true', NEXT_PUBLIC_BACKEND: 'bundled' };

for (const name of PACKAGES) {
  run(`pnpm --filter ${name} build`);
}

/*
 * Drop Next's fetch cache before an API-backed export.
 *
 * `serverGet` fetches with `force-cache` during an export — it has to, because
 * `no-store` opts the route into dynamic rendering and `output: 'export'` then
 * omits the page entirely. The cost is that Next persists those responses in
 * .next/cache/fetch-cache and reuses them on the next build, so an export can
 * bake in a snapshot of an API that has since changed. That is exactly what
 * happened after the media URLs were made absolute: the API served the new
 * shape, the rebuild kept emitting the old one, and the pages shipped with
 * image paths that 404.
 *
 * A fresh CI container never has this cache, which is what makes it dangerous:
 * it is invisible in the environment that deploys and wrong in the one that
 * verifies. Only the fetch cache goes — the webpack and SWC caches are what
 * make rebuilds quick, and they are not snapshots of anything external.
 */
for (const app of ['storefront', 'admin']) {
  rmSync(join('apps', app, '.next', 'cache', 'fetch-cache'), { recursive: true, force: true });
}

run('pnpm --filter @outlet/storefront build', apiEnv);

/*
 * The admin panel is built second and nested at /admin inside the storefront's
 * export, so both ship from one Pages project on one domain.
 *
 * ADMIN_BASE_PATH makes Next emit every internal link, router push and asset
 * URL under /admin; without it the nested copy would load the storefront's
 * chunks and blank out. The two exports have separate `_next` directories and
 * no overlapping paths, so the copy cannot clobber storefront files.
 */
run('pnpm --filter @outlet/admin build', { ...apiEnv, ADMIN_BASE_PATH: '/admin' });

rmSync(ADMIN_NESTED, { recursive: true, force: true });
cpSync(ADMIN_OUT, ADMIN_NESTED, { recursive: true });

console.log(`\nStatic export written to ${STOREFRONT_OUT}`);
console.log(`Admin panel nested at ${ADMIN_NESTED} (served from /admin)`);
console.log(
  apiBacked
    ? `Both talk to ${apiBaseUrl}. Remember to add this Pages URL to the Worker's ALLOWED_ORIGINS.`
    : 'Both use the bundled catalogue. Set API_BASE_URL for a database-backed build.',
);
