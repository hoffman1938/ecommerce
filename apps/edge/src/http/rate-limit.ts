/**
 * Rate limiting on Workers KV.
 *
 * A fixed window per (bucket, identity), counted in KV with a TTL. KV is
 * eventually consistent, so a determined attacker distributing across colos
 * can exceed a limit briefly — which is the accepted trade for a free,
 * Cloudflare-native mechanism. The purpose here is to make trivial
 * brute-forcing (a script hammering /auth/login) useless, and for that it is
 * entirely adequate.
 *
 * If the KV binding is missing the limiter is a no-op. That is a deliberate
 * fail-open: a fork that has not created the namespace should still run the
 * demo, and no security decision other than throttling depends on this.
 */

import { ApiError } from '../lib/errors';

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. KV TTLs have a 60s floor. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 900 },
  passwordReset: { limit: 5, windowSeconds: 900 },
  checkout: { limit: 20, windowSeconds: 300 },
  coupon: { limit: 30, windowSeconds: 300 },
  review: { limit: 10, windowSeconds: 3600 },
  search: { limit: 120, windowSeconds: 60 },
  upload: { limit: 30, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export async function enforceRateLimit(
  kv: KVNamespace | undefined,
  bucket: RateLimitBucket,
  identity: string | null,
): Promise<void> {
  if (!kv || !identity) return;

  const rule = RATE_LIMITS[bucket];
  // Fixed windows keyed by their own start time: the key expires with the
  // window, so nothing has to be swept.
  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds);
  const key = `rl:${bucket}:${identity}:${window}`;

  let count = 0;
  try {
    const existing = await kv.get(key);
    count = existing ? Number.parseInt(existing, 10) : 0;
  } catch {
    // A KV read failure must not take the API down with it.
    return;
  }

  if (count >= rule.limit) {
    throw new ApiError('RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.');
  }

  try {
    await kv.put(key, String(count + 1), {
      expirationTtl: Math.max(60, rule.windowSeconds),
    });
  } catch {
    // Counting is best-effort; the request proceeds.
  }
}
