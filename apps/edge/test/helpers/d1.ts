/**
 * A D1 stand-in backed by Node's built-in SQLite.
 *
 * D1 *is* SQLite, and the interface the Worker uses is small: prepare, bind,
 * all/first/run, and batch. Implementing those over `node:sqlite` lets the real
 * handlers run against the real schema and the real seed in-process, with no
 * container, no network and no Cloudflare account — which is what makes it
 * practical to assert on things like "the second concurrent order is rejected"
 * in a unit test.
 *
 * What it does not reproduce is D1's distribution: latency, eventual read
 * consistency at the edge, and its request limits. Those belong to a deployed
 * environment, and the tests here do not claim to cover them.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, '..', '..');

/**
 * `node:sqlite` is loaded through createRequire rather than imported.
 *
 * Vite — which Vitest runs the test files through — resolves import specifiers
 * against its own list of Node builtins, and `node:sqlite` is new enough not to
 * be on it, so a static import fails to resolve before the test ever runs.
 * A runtime require is invisible to that analysis.
 */
const nodeRequire = createRequire(import.meta.url);

interface SqliteStatement {
  all(...bindings: unknown[]): unknown[];
  get(...bindings: unknown[]): unknown;
  run(...bindings: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface DatabaseSync {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

type Row = Record<string, unknown>;

class StubStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly bindings: unknown[] = [],
  ) {}

  bind(...values: unknown[]): StubStatement {
    return new StubStatement(this.db, this.sql, values);
  }

  private prepared() {
    return this.db.prepare(this.sql);
  }

  async all<T = Row>(): Promise<{ results: T[]; success: true; meta: Record<string, number> }> {
    const results = this.prepared().all(...(this.bindings as never[])) as T[];
    return { results, success: true, meta: { changes: 0 } };
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.prepared().get(...(this.bindings as never[])) as Row | undefined;
    if (row === undefined) return null;
    if (column) return (row[column] ?? null) as T;
    return row as T;
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const result = this.prepared().run(...(this.bindings as never[]));
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }

  raw(): Promise<unknown[][]> {
    const rows = this.prepared().all(...(this.bindings as never[])) as Row[];
    return Promise.resolve(rows.map((row) => Object.values(row)));
  }
}

export class StubD1 {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): StubStatement {
    return new StubStatement(this.db, sql);
  }

  /**
   * D1 runs a batch inside a transaction: the statements apply in order and
   * roll back together. Reproduced with an explicit SAVEPOINT so a CHECK
   * constraint failing part-way through leaves nothing behind, which is the
   * property the checkout path depends on.
   */
  async batch<T = Row>(
    statements: StubStatement[],
  ): Promise<Array<{ results: T[]; success: true; meta: Record<string, number> }>> {
    this.db.exec('SAVEPOINT d1_batch');
    try {
      const out = [];
      for (const statement of statements) out.push(await statement.all<T>());
      this.db.exec('RELEASE d1_batch');
      return out;
    } catch (error) {
      this.db.exec('ROLLBACK TO d1_batch');
      this.db.exec('RELEASE d1_batch');
      throw error;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error('dump() is not supported by the test stub');
  }

  withSession(): never {
    throw new Error('withSession() is not supported by the test stub');
  }

  raw() {
    return this.db;
  }
}

let cachedSeedSql = '';

/** Builds the seed once per process; it is deterministic, so reuse is safe. */
async function seedSql(): Promise<string> {
  if (cachedSeedSql) return cachedSeedSql;
  // The seed generator is plain JavaScript with no declaration file; the
  // shape it returns is asserted here rather than pretending it is typed.
  const module = (await import('../../scripts/build-seed-sql.mjs')) as {
    generateSeedSql(env: Record<string, string>): { sql: string };
  };
  cachedSeedSql = module.generateSeedSql({
    SEED_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
    SEED_CUSTOMER_PASSWORD: TEST_CUSTOMER_PASSWORD,
  }).sql;
  return cachedSeedSql;
}

/**
 * Fixed passwords for tests only. They are not a secret and are not used by
 * any deployment: the seed takes its passwords from the environment, and this
 * is the environment a test provides.
 */
export const TEST_ADMIN_PASSWORD = 'test-admin-password-9f2c';
export const TEST_CUSTOMER_PASSWORD = 'test-customer-password-4a71';

export function applyMigrations(db: DatabaseSync): void {
  const dir = join(APP_ROOT, 'migrations');
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'));
  }
}

export interface TestDatabase {
  d1: StubD1;
  sqlite: DatabaseSync;
  close(): void;
}

/** An empty database with the schema applied. */
export function createEmptyDatabase(): TestDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqlite);
  return { d1: new StubD1(sqlite), sqlite, close: () => sqlite.close() };
}

/** Schema plus the full demo seed — what the deployed demo actually holds. */
export async function createSeededDatabase(): Promise<TestDatabase> {
  const database = createEmptyDatabase();
  database.sqlite.exec(await seedSql());
  return database;
}
