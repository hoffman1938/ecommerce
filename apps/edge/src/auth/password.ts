/**
 * Password hashing on Workers.
 *
 * The Node stack used argon2id. Workers cannot: argon2 and bcrypt are native
 * modules, and the runtime has no way to load them. What the platform does
 * give is Web Crypto's PBKDF2, which is a standard, well-analysed KDF and the
 * accepted choice on this runtime.
 *
 * Parameters follow OWASP's PBKDF2-HMAC-SHA256 guidance (600,000 iterations).
 * That is a real cost on every login — deliberately, since it is the same cost
 * an attacker pays per guess — and it fits inside a Worker's CPU budget
 * comfortably because it runs once per sign-in, not per request; sessions are
 * validated by a cheap HMAC afterwards.
 *
 * Stored form (self-describing, so the parameters can be raised later without
 * invalidating existing hashes):
 *
 *   pbkdf2$sha256$<iterations>$<salt-base64>$<derived-key-base64>
 */

const ALGORITHM = 'pbkdf2';
const DIGEST = 'sha256';
const ITERATIONS = 600_000;
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
