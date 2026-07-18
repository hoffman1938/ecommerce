import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';

// --- Passwords -------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// --- Opaque tokens (sessions, email verification, password reset) ----------
//
// Tokens are random 256-bit values handed to the client; only an HMAC of the
// token is stored server-side, so a database leak does not expose usable
// session or reset tokens.

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --- Captcha provider interface -------------------------------------------

export interface CaptchaProvider {
  /** Returns true when the captcha token is acceptable. */
  verify(token: string | undefined, remoteIp?: string): Promise<boolean>;
}

/** Local development: captcha disabled, always passes. */
export class NoopCaptchaProvider implements CaptchaProvider {
  async verify(): Promise<boolean> {
    return true;
  }
}

/** Cloudflare Turnstile verification (production-ready, optional). */
export class TurnstileCaptchaProvider implements CaptchaProvider {
  constructor(private readonly secretKey: string) {}

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!token) return false;
    const body = new URLSearchParams({ secret: this.secretKey, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  }
}

export function createCaptchaProvider(
  provider: 'none' | 'turnstile',
  turnstileSecretKey?: string,
): CaptchaProvider {
  if (provider === 'turnstile' && turnstileSecretKey) {
    return new TurnstileCaptchaProvider(turnstileSecretKey);
  }
  return new NoopCaptchaProvider();
}
