/**
 * Shared plumbing for the database scripts.
 *
 * The guard in `resolveTarget` is the point of this file. `--remote` touches a
 * real Cloudflare database, and the reset script drops every row in it, so
 * neither is allowed to run by accident: the target must be named explicitly,
 * and destructive operations against a remote database additionally require
 * the environment to identify itself as a demo one.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

export const DATABASE_NAME = 'outlet-demo';

export function resolveTarget(argv) {
  const local = argv.includes('--local');
  const remote = argv.includes('--remote');

  if (local === remote) {
    console.error('Specify exactly one of --local or --remote.\n');
    console.error('  --local   the miniflare database `wrangler dev` uses');
    console.error('  --remote  the real Cloudflare D1 database');
    process.exit(1);
  }

  return remote
    ? { label: 'remote', flag: '--remote', isRemote: true }
    : { label: 'local', flag: '--local', isRemote: false };
}

/**
 * Refuses to destroy a database that has not said it is a demo.
 *
 * `ENVIRONMENT` has to be a demo-ish value *and* the caller has to pass
 * `--yes-really`. Two independent conditions, because either one alone is
 * something somebody could satisfy without meaning to.
 */
export function assertResettable(target, argv) {
  if (!target.isRemote) return;

  const environment = (process.env.ENVIRONMENT ?? '').toLowerCase();
  const allowed = ['demo', 'staging', 'preview', 'development'];

  if (!allowed.includes(environment)) {
    console.error('Refusing to reset a remote database.\n');
    console.error(`  ENVIRONMENT is ${environment ? `"${environment}"` : 'not set'}.`);
    console.error(`  It must be one of: ${allowed.join(', ')}.`);
    console.error('\nThis command deletes every row. If the database you mean really is a');
    console.error('demo one, set ENVIRONMENT and run it again.');
    process.exit(1);
  }

  if (!argv.includes('--yes-really')) {
    console.error('Refusing to reset a remote database without --yes-really.\n');
    console.error(`  This deletes every row in "${DATABASE_NAME}" and re-seeds it.`);
    console.error('\n  node scripts/reset-demo.mjs --remote --yes-really');
    process.exit(1);
  }
}

/**
 * Wrangler's own JS entry point, resolved from node_modules.
 *
 * Running it with `process.execPath` rather than through `pnpm exec` avoids
 * two Windows problems at once: `pnpm` and `wrangler` are both `.cmd` shims,
 * which Node refuses to spawn directly since CVE-2024-27980, and going through
 * a shell instead would mean quoting file paths that can contain spaces. Node
 * executing a `.js` file needs neither.
 */
const wranglerEntry = () => {
  const require = createRequire(import.meta.url);
  for (const candidate of ['wrangler/bin/wrangler.js', 'wrangler/wrangler-dist/cli.js']) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next known layout.
    }
  }
  console.error('Could not find wrangler. Run `pnpm install` first.');
  process.exit(1);
};

export function runWrangler(args, cwd) {
  try {
    execFileSync(process.execPath, [wranglerEntry(), ...args], { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`\nwrangler ${args[0]} ${args[1] ?? ''} failed.`);
    process.exit(typeof error.status === 'number' ? error.status : 1);
  }
}
