/**
 * Worker bindings and configuration.
 *
 * Every value here arrives from Cloudflare at runtime — either as a binding
 * (D1, R2, KV) or as an environment variable/secret. Nothing is read from a
 * file and nothing is hardcoded, which is what lets the repository stay public.
 *
 * The split that matters: `vars` in wrangler.toml are public and committed;
 * secrets are set with `wrangler secret put` and never appear in the tree. If
 * you are adding a value, ask whether an attacker reading this repository
 * would learn anything from it. If yes, it is a secret.
 */

export interface Env {
  // --- Bindings --------------------------------------------------------------
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Optional: rate limiting degrades to "off" rather than failing closed. */
  RATE_LIMIT?: KVNamespace;

  // --- Public configuration (wrangler.toml [vars]) ---------------------------
  ENVIRONMENT?: string;
  DEMO_MODE?: string;
  /** Comma-separated exact origins permitted to send credentialed requests. */
  ALLOWED_ORIGINS?: string;
  /** Public base URL media is served from; empty means "serve via this Worker". */
  PUBLIC_MEDIA_BASE_URL?: string;

  // --- Secrets (wrangler secret put) ----------------------------------------
  /** HMAC key for session/reset token hashes. Required outside development. */
  SESSION_SECRET?: string;
  /** Password for the seeded admin account. Only read by the seed endpoint. */
  SEED_ADMIN_PASSWORD?: string;
  /** Password for the seeded customer/staff accounts. */
  SEED_CUSTOMER_PASSWORD?: string;
  /** Bearer token authorising the seed/reset endpoints. Absent = disabled. */
  ADMIN_SEED_TOKEN?: string;
}

export interface AppConfig {
  environment: string;
  isDemo: boolean;
  /**
   * True only for `wrangler dev`. Controls whether the session cookie may be
   * sent over plain HTTP — never widened by DEMO_MODE, which must not weaken
   * security (see SECURITY.md).
   */
  isDevelopment: boolean;
  allowedOrigins: string[];
  mediaBaseUrl: string;
  sessionSecret: string;
}

/**
 * A development-only fallback so `wrangler dev` runs before any secret is set.
 * It is deliberately a constant everyone can read: it protects nothing, and
 * that is the point — a shared value in a public repository is not a secret,
 * so treating it as one would be theatre. Deployments must set the real one.
 */
const DEV_SESSION_SECRET = 'development-only-session-secret-not-for-deployment';

export function readConfig(env: Env): AppConfig {
  const environment = env.ENVIRONMENT ?? 'development';
  const isDevelopment = environment === 'development';

  const sessionSecret = env.SESSION_SECRET?.trim();
  if (!sessionSecret && !isDevelopment) {
    // Refusing to start beats signing session tokens with a value an attacker
    // can read in the repository.
    throw new Error('SESSION_SECRET is not configured for this environment');
  }

  return {
    environment,
    isDemo: env.DEMO_MODE === 'true',
    isDevelopment,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    mediaBaseUrl: (env.PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, ''),
    sessionSecret: sessionSecret || DEV_SESSION_SECRET,
  };
}
