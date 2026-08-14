/**
 * D1 access helpers.
 *
 * Everything the API does against the database goes through this module, and
 * every function here takes values as bound parameters. There is no helper that
 * accepts a caller-supplied SQL fragment — an identifier that varies by request
 * (a sort column, a filter column) is resolved through an allow-list *before*
 * it reaches a query string, never interpolated from user input. That is the
 * single rule keeping SQL injection out of the API.
 *
 * The type mapping is the mirror of the one in migrations/0001_init.sql:
 * SQLite gives back INTEGER for booleans and TEXT for JSON, and the row
 * decoders below turn those into the shapes the API's callers expect.
 */

import { ApiError } from './errors';

export type SqlValue = string | number | null;

/** SQLite has no boolean type; 0/1 is the storage form. */
export const bool = (value: boolean): number => (value ? 1 : 0);
export const fromBool = (value: unknown): boolean => value === 1 || value === true;

/** ISO-8601 UTC with milliseconds — the format every timestamp column holds. */
export const nowIso = (): string => new Date().toISOString();
export const toIso = (date: Date): string => date.toISOString();
export const isoPlusMs = (ms: number): string => new Date(Date.now() + ms).toISOString();

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    // A malformed JSON column is a data bug, not a client error. Callers get
    // the fallback so one bad row cannot blank an entire listing.
    return fallback;
  }
}

export const toJson = (value: unknown): string => JSON.stringify(value ?? null);

/**
 * Resolves a client-supplied key to a trusted SQL fragment.
 *
 * Sorting is the classic place raw identifiers reach a query. Callers pass the
 * user's string and a map of *known* keys; anything unrecognised falls back to
 * the default rather than being passed through.
 */
export function allowListed<T extends string>(
  value: string | undefined | null,
  allowed: Record<T, string>,
  fallback: T,
): string {
  if (value && Object.prototype.hasOwnProperty.call(allowed, value)) {
    return allowed[value as T];
  }
  return allowed[fallback];
}

/** Builds `(?, ?, ?)` for an IN clause and returns the bindings alongside it. */
export function inClause(values: readonly string[]): { sql: string; bindings: string[] } {
  if (values.length === 0) return { sql: '(NULL)', bindings: [] };
  return { sql: `(${values.map(() => '?').join(', ')})`, bindings: [...values] };
}

export class Db {
  constructor(private readonly d1: D1Database) {}

  async all<T>(sql: string, ...bindings: SqlValue[]): Promise<T[]> {
    const result = await this.d1
      .prepare(sql)
      .bind(...bindings)
      .all<T>();
    return result.results ?? [];
  }

  async first<T>(sql: string, ...bindings: SqlValue[]): Promise<T | null> {
    return this.d1
      .prepare(sql)
      .bind(...bindings)
      .first<T>();
  }

  async count(sql: string, ...bindings: SqlValue[]): Promise<number> {
    const row = await this.first<{ c: number }>(sql, ...bindings);
    return row?.c ?? 0;
  }

  async run(sql: string, ...bindings: SqlValue[]): Promise<D1Result> {
    return this.d1
      .prepare(sql)
      .bind(...bindings)
      .run();
  }

  /** How many rows the last statement actually changed. */
  static changes(result: D1Result): number {
    return result.meta?.changes ?? 0;
  }

  statement(sql: string, ...bindings: SqlValue[]): D1PreparedStatement {
    return this.d1.prepare(sql).bind(...bindings);
  }

  /**
   * Runs statements as one D1 batch.
   *
   * D1 wraps a batch in a transaction: the statements are applied in order and
   * roll back together if one fails. That is what makes order placement safe —
   * the stock decrement, the order rows and the reservation update cannot
   * half-apply. A CHECK constraint failing mid-batch aborts the whole thing,
   * which is precisely how "stock went negative" is prevented rather than
   * merely detected.
   */
  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    if (statements.length === 0) return [];
    return this.d1.batch(statements);
  }
}

/**
 * Recognises the constraint violations the API has a sensible answer for.
 *
 * D1 surfaces these as message strings; matching on them here means one place
 * knows the mapping, and a raw SQLite message never reaches a response body.
 */
export function translateDbError(error: unknown): ApiError | null {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('inventory_quantities_non_negative')) {
    return new ApiError('OUT_OF_STOCK', 'That item just sold out.');
  }
  if (message.includes('inventory_reserved_lte_on_hand')) {
    return new ApiError('OUT_OF_STOCK', 'There is not enough stock left for that quantity.');
  }
  if (message.includes('orders_checkoutIdempotencyKey_key')) {
    return new ApiError('CONFLICT', 'That order has already been placed.');
  }
  if (message.includes('UNIQUE constraint failed')) {
    return new ApiError('CONFLICT', 'That already exists.');
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new ApiError('BAD_REQUEST', 'That referenced something which does not exist.');
  }
  return null;
}
