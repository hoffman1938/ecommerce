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
 *   API_BASE_URL unset  the bundled-catalogue fallback. Browsable, but there
 *                       is no database behind it, so nothing can be bought.
 *                       A build warns loudly when it lands here, because a
 *                       deploy that silently degraded to a mock is exactly the
 *                       failure this script exists to make visible.
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

if (apiBacked) {
  console.log(`Building against the Worker API at ${apiBaseUrl}`);
} else {
  console.warn(
    [
      '',
      '='.repeat(78),
      'API_BASE_URL is not set.',
      '',
      'Falling back to the bundled catalogue: the export will be browsable but',
      'has no database behind it, so sign-in, cart and checkout will not work.',
      '',
      'For the real demo, deploy the Worker first and set API_BASE_URL to its',
      'URL — see infrastructure/cloudflare/d1-and-r2.md.',
      '='.repeat(78),
      '',
    ].join('\n'),
  );
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
  ? { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl, API_INTERNAL_URL: apiBaseUrl, STATIC_EXPORT: 'true' }
  : { NEXT_PUBLIC_DEMO_MODE: 'true' };

for (const name of PACKAGES) {
  run(`pnpm --filter ${name} build`);
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
