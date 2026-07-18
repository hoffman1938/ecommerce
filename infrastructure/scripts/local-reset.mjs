#!/usr/bin/env node
/**
 * `pnpm local:reset`
 *
 * Stops local containers, removes development volumes, restarts services,
 * runs migrations, and inserts seed data. Docker Compose's `migrate` one-shot
 * service performs the migration + seed step during `up`.
 */
import { execSync } from 'node:child_process';

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

console.log('Resetting local environment (containers + volumes + data)...');
run('docker compose down --volumes --remove-orphans');
run('docker compose up --build -d');
console.log('\nLocal environment reset complete.');
console.log('Storefront: http://localhost:3000');
console.log('Admin:      http://localhost:3001');
console.log('API docs:   http://localhost:4000/docs');
console.log('Mailpit:    http://localhost:8025');
console.log('MinIO UI:   http://localhost:9001');
