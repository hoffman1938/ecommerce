/**
 * Identifier generation.
 *
 * The PostgreSQL schema used Prisma's `cuid()`. Workers have no Prisma, so the
 * shape is reproduced here: a `c` prefix, a base-36 timestamp, and randomness
 * from `crypto.getRandomValues`. The important properties are preserved —
 * collision-resistant, URL-safe, and monotonically increasing at second
 * resolution so `ORDER BY id` roughly tracks insertion order.
 */

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
 * cuid does not. The counter comes from the current row count, which is
 * adequate here because order creation is serialised through one D1 batch.
 */
export function formatOrderNumber(sequence: number): string {
  return `OUT-${100000 + sequence}`;
}

export function formatRmaNumber(sequence: number): string {
  return `RMA-${100000 + sequence}`;
}
