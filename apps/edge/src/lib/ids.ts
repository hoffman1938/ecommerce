/**
 * Identifier generation.
 *
 * The PostgreSQL schema used Prisma's `cuid()`. Workers have no Prisma, so the
 * shape is reproduced here: a `c` prefix, a base-36 timestamp, and randomness
 * from `crypto.getRandomValues`. The important properties are preserved —
 * collision-resistant, URL-safe, and monotonically increasing at second
 * resolution so `ORDER BY id` roughly tracks insertion order.
 */

import type { Db } from './sql';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBlock(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function newId(): string {
  return `c${Date.now().toString(36)}${randomBlock(16)}`;
}

/** A 256-bit opaque token, handed to a client and never stored in the clear. */
export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sequential, human-quotable reference numbers.
 *
 * A customer reads these out; `OUT-100001` survives a phone call in a way a
 * cuid does not.
 */
const REFERENCE_BASE = 100000;

export function formatOrderNumber(sequence: number): string {
  return `OUT-${REFERENCE_BASE + sequence}`;
}

export function formatRmaNumber(sequence: number): string {
  return `RMA-${REFERENCE_BASE + sequence}`;
}

/**
 * The sequence number that follows the highest reference already issued.
 *
 * These used to be numbered from `COUNT(*)`, which is the same thing only
 * while the series has no gaps — and it has them. The seed plans a fixed list
 * of orders and silently drops any it cannot stock, so the table can hold
 * `OUT-100004` while containing three rows; the next checkout then computed
 * `OUT-100004` again and died on the UNIQUE index as a 500 at the moment of
 * payment. Deleting any row would have done the same thing.
 *
 * Reading the maximum is correct whatever the history, and stays correct if
 * rows are removed. The comparison is lexicographic, which agrees with numeric
 * order for as long as the suffix is six digits — 899,999 references away.
 */
function sequenceAfter(highest: string | null | undefined, prefix: string): number {
  const suffix = Number(highest?.slice(prefix.length + 1));
  return Number.isFinite(suffix) && suffix > REFERENCE_BASE ? suffix - REFERENCE_BASE + 1 : 1;
}

export async function nextOrderNumber(db: Db): Promise<string> {
  const row = await db.first<{ highest: string | null }>(
    `SELECT MAX("orderNumber") AS "highest" FROM "orders" WHERE "orderNumber" LIKE 'OUT-%'`,
  );
  return formatOrderNumber(sequenceAfter(row?.highest, 'OUT'));
}

export async function nextRmaNumber(db: Db): Promise<string> {
  const row = await db.first<{ highest: string | null }>(
    `SELECT MAX("rmaNumber") AS "highest" FROM "return_requests" WHERE "rmaNumber" LIKE 'RMA-%'`,
  );
  return formatRmaNumber(sequenceAfter(row?.highest, 'RMA'));
}
