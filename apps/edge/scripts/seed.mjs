#!/usr/bin/env node
/**
 * `pnpm db:seed` — loads the demo data into D1.
 *
 *   node scripts/seed.mjs --local     the miniflare database `wrangler dev` uses
 *   node scripts/seed.mjs --remote    the real D1 database
 *
 * The file it applies is generated first, so the seed always matches the
 * catalogue in the working tree rather than a checked-in snapshot of it. Every
 * statement is idempotent: running this twice adds nothing.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportCounts, writeSeedSql } from './build-seed-sql.mjs';
import { DATABASE_NAME, resolveTarget, runWrangler } from './lib/wrangler.mjs';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const target = resolveTarget(process.argv.slice(2));

console.log(`Building the seed…`);
const { paths, counts, generated, bytes, statements } = writeSeedSql();
console.log(`  ${statements} statements, ${(bytes / 1024).toFixed(0)} KB in ${paths.length} files\n`);
reportCounts(counts);

console.log(`\nApplying to the ${target.label} database "${DATABASE_NAME}"…`);
for (const [index, file] of paths.entries()) {
  process.stdout.write(`  part ${index + 1}/${paths.length}… `);
  runWrangler(['d1', 'execute', DATABASE_NAME, target.flag, `--file=${file}`, '--yes'], APP_ROOT);
}

console.log('\nSeed applied.');

if (generated.length > 0) {
  console.log('\nDemo passwords were generated because none were configured.');
  console.log('Copy them now — they are not written to disk:\n');
  for (const [label, value] of generated) console.log(`  ${label}\n    ${value}\n`);
  console.log('Set SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD to choose your own,');
  console.log('and re-run against an empty database for them to take effect.');
} else {
  console.log('\nDemo passwords came from SEED_ADMIN_PASSWORD / SEED_CUSTOMER_PASSWORD.');
}
