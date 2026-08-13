/**
 * Types for the seed generator.
 *
 * The generator itself is plain JavaScript so it can be run directly with
 * `node scripts/build-seed-sql.mjs` without a build step — this declares its
 * surface for the test suite, which is TypeScript.
 */

export interface SeedCounts {
  [entity: string]: number;
}

export interface GeneratedSeed {
  sql: string;
  counts: SeedCounts;
  /** Passwords generated because the environment supplied none. */
  generated: Array<[label: string, password: string]>;
}

export declare const SEED_SQL_PATH: string;

export declare function generateSeedSql(env?: Record<string, string | undefined>): GeneratedSeed;

export declare function writeSeedSql(env?: Record<string, string | undefined>): {
  path: string;
  counts: SeedCounts;
  generated: Array<[label: string, password: string]>;
  bytes: number;
};

export declare function resolveDemoPasswords(env?: Record<string, string | undefined>): {
  admin: string;
  customer: string;
  generated: Array<[label: string, password: string]>;
};

export declare function reportCounts(counts: SeedCounts): void;
