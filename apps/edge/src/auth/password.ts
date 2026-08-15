/**
 * Password hashing on Workers.
 *
 * The Node stack used argon2id. Workers cannot: argon2 and bcrypt are native
 * modules, and the runtime has no way to load them. What the platform does
 * give is Web Crypto's PBKDF2, which is a standard, well-analysed KDF and the
 * accepted choice on this runtime.
 *
 * The iteration count is 100,000, which is the most workerd will do:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 *   supported (requested 600000).
 *
 * This is a hard platform cap, not a tuning choice. It is below OWASP's 600,000
 * for PBKDF2-HMAC-SHA256, and that gap is a documented limitation of running on
 * this runtime — see SECURITY.md.
 *
 * The cap deserves care because of *how* exceeding it failed: `hashPassword`
 * threw, so registration returned 500, and `verifyPassword` caught the same
 * error and returned false, so every sign-in was rejected as a wrong password.
 * The deployed API could not authenticate anybody, and said nothing about why.
 * Node's Web Crypto has no such cap, so the whole test suite passed against
 * 600,000. `iterationsWithinPlatformLimit` below exists to be asserted in a
 * test, since the runtime that enforces this is not the one the tests run on.
 *
 * Stored form (self-describing, so the parameters can be raised later without
 * invalidating existing hashes):
 *
 *   pbkdf2$sha256$<iterations>$<salt-base64>$<derived-key-base64>
 */

const ALGORITHM = 'pbkdf2';
const DIGEST = 'sha256';

/** workerd refuses anything above this. */
export const MAX_WORKERD_ITERATIONS = 100_000;
const ITERATIONS = 100_000;

/** Asserted by the test suite; the runtime that enforces it is not Node. */
export const iterationsWithinPlatformLimit = (): boolean => ITERATIONS <= MAX_WORKERD_ITERATIONS;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const derived = await derive(plain, salt, ITERATIONS);
  return [ALGORITHM, DIGEST, ITERATIONS, toBase64(salt), toBase64(derived)].join('$');
}

/**
 * Constant-time comparison.
 *
 * Returning early on the first differing byte would leak how much of a guess
 * was correct. This walks both buffers in full regardless.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5) return false;
  const [algorithm, digest, iterationsRaw, saltB64, hashB64] = parts;
  if (algorithm !== ALGORITHM || digest !== DIGEST) return false;

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > 2_000_000) return false;

  try {
    const derived = await derive(plain, fromBase64(saltB64), iterations);
    return timingSafeEqual(derived, fromBase64(hashB64));
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 5) return true;
  return Number.parseInt(parts[2], 10) < ITERATIONS;
}
