/**
 * Opaque tokens for sessions, password resets and email verification.
 *
 * The client is handed 256 bits of randomness; the database stores only an
 * HMAC of it, keyed by SESSION_SECRET. So a leaked database dump yields no
 * usable session — the same property the Node implementation had, rebuilt on
 * Web Crypto.
 */

import { newToken } from '../lib/ids';

export { newToken };

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function hashToken(token: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares two hex digests without leaking where they diverge.
 *
 * These are hashes rather than secrets, so the risk is smaller than for the
 * password path — but the lookup is by token hash, and a timing oracle on it
 * would let an attacker walk a valid session hash out byte by byte.
 */
export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
