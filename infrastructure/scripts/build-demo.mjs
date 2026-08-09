#!/usr/bin/env node
/**
 * `pnpm build:cloudflare`
 *
 * Builds the packages the storefront depends on, then the storefront itself in
 * demo mode — the fully static export Cloudflare Pages serves, with the catalog
 * bundled into the client instead of an API behind it.
 *
 * This exists as a script rather than an inline `NEXT_PUBLIC_DEMO_MODE=true …`
 * in package.json because that syntax is a shell-ism: it works in the Linux
 * container Pages builds in and fails on a Windows developer machine, which is
 * exactly the sort of thing that only surfaces when someone tries to reproduce
 * a deploy locally.
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

// Run through a shell: on Windows `pnpm` is a .cmd shim, which Node refuses to
// spawn directly. Every argument here is a literal from this file, so there is
// nothing interpolated for a shell to reinterpret.
const run = (command, env) => {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
};

for (const name of PACKAGES) {
  run(`pnpm --filter ${name} build`);
}

run('pnpm --filter @outlet/storefront build', { NEXT_PUBLIC_DEMO_MODE: 'true' });

/*
 * The admin panel is built second and nested at /admin inside the storefront's
 * export, so both ship from one Pages project on one domain.
 *
 * `ADMIN_BASE_PATH` makes Next emit every internal link, router push and asset
 * URL under /admin; without it the nested copy would load the storefront's
 * chunks and blank out. The two exports have separate `_next` directories and
 * no overlapping paths, so the copy cannot clobber storefront files.
 */
run('pnpm --filter @outlet/admin build', {
  NEXT_PUBLIC_DEMO_MODE: 'true',
  ADMIN_BASE_PATH: '/admin',
});

rmSync(ADMIN_NESTED, { recursive: true, force: true });
cpSync(ADMIN_OUT, ADMIN_NESTED, { recursive: true });

console.log(`\nStatic export written to ${STOREFRONT_OUT}`);
console.log(`Admin panel nested at ${ADMIN_NESTED} (served from /admin)`);
