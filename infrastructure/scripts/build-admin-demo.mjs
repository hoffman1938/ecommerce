#!/usr/bin/env node
/**
 * `pnpm build:admin-demo`
 *
 * Builds the packages the admin panel depends on, then the panel itself in
 * demo mode — the fully static export Cloudflare Pages serves, backed by the
 * bundled dataset in apps/admin/src/lib/demo instead of the NestJS API.
 *
 * Mirrors build-demo.mjs (the storefront equivalent) and exists for the same
 * reason: an inline `NEXT_PUBLIC_DEMO_MODE=true …` in package.json is a
 * shell-ism that works in Cloudflare's Linux container and fails on a Windows
 * developer machine.
 */
import { execSync } from 'node:child_process';

const PACKAGES = ['@outlet/types', '@outlet/catalog', '@outlet/validation', '@outlet/ui'];

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

run('pnpm --filter @outlet/admin build', { NEXT_PUBLIC_DEMO_MODE: 'true' });

console.log('\nStatic export written to apps/admin/out');
