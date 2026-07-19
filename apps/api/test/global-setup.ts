import { execSync } from 'node:child_process';
import * as path from 'node:path';

/** Applies migrations to the test database once per test run. */
export default async function globalSetup(): Promise<void> {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://outlet:outlet@localhost:5432/outlet_test';
  const databaseDir = path.resolve(__dirname, '../../../packages/database');
  execSync('npx prisma migrate deploy', {
    cwd: databaseDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
