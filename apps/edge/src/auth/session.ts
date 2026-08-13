/**
 * Sessions and the cookies that carry them.
 *
 * A session is a row in `user_sessions` plus an opaque token in an HttpOnly
 * cookie. The row holds only an HMAC of the token, so the cookie is the single
 * copy of the credential and the database cannot leak a usable one.
 *
 * Cookie attributes are decided by environment, not by convenience:
 *
 *   Production/demo   HttpOnly; Secure; SameSite=None; Path=/
 *   Development       HttpOnly; SameSite=Lax; Path=/
 *
 * `SameSite=None` is not a relaxation chosen for comfort — the frontend is on
 * *.pages.dev and this API is on *.workers.dev, and both are public suffixes,
 * so the request is cross-site by construction and `Lax` would drop the cookie
 * entirely. The CSRF exposure that opens is closed in http/security.ts, which
 * rejects any state-changing request whose Origin is not on the allow-list
 * *before* the handler runs.
 */

import type { AppConfig } from '../env';
import { Db, bool, fromBool, isoPlusMs, nowIso } from '../lib/sql';
import { newId } from '../lib/ids';
import { hashToken, newToken } from './tokens';

export const SESSION_COOKIE = 'outlet_session';
export const CART_COOKIE = 'outlet_cart';

/** Sessions expire; an abandoned browser tab must not stay signed in forever. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Anonymous carts outlive a session so a shopper does not lose a basket. */
const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  isEmailVerified: boolean;
  newsletterOptIn: boolean;
  notifyOrderUpdates: boolean;
  notifyCampaigns: boolean;
  createdAt: string;
}

export interface AuthenticatedSession {
  sessionId: string;
  user: SessionUser;
  permissions: Set<string>;
  roles: string[];
}

function cookieAttributes(config: AppConfig, maxAgeSeconds: number): string {
  const sameSite = config.isDevelopment ? 'Lax' : 'None';
  const secure = config.isDevelopment ? '' : '; Secure';
  return `Path=/; HttpOnly; SameSite=${sameSite}${secure}; Max-Age=${maxAgeSeconds}`;
}

export function sessionCookie(config: AppConfig, token: string): string {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(config, SESSION_TTL_MS / 1000)}`;
}

export function clearedSessionCookie(config: AppConfig): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(config, 0)}`;
}

export function cartCookie(config: AppConfig, token: string): string {
  return `${CART_COOKIE}=${token}; ${cookieAttributes(config, CART_TTL_MS / 1000)}`;
}

export function readCookie(header: string | undefined | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

interface SessionRow {
  sessionId: string;
  expiresAt: string;
  revokedAt: string | null;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  isEmailVerified: number;
  newsletterOptIn: number;
  notifyOrderUpdates: number;
  notifyCampaigns: number;
  createdAt: string;
}

/**
 * Resolves a cookie to a live session, or null.
 *
 * One query joins the session to its user; the permission lookup is a second
 * query and only runs for a session that survived validation. A disabled
 * account fails here rather than at each admin endpoint, so switching a user
 * off takes effect on their next request everywhere at once.
 */
export async function resolveSession(
  db: Db,
  config: AppConfig,
  token: string | null,
): Promise<AuthenticatedSession | null> {
  if (!token) return null;

  const tokenHash = await hashToken(token, config.sessionSecret);
  const row = await db.first<SessionRow>(
    `SELECT s."id" AS "sessionId", s."expiresAt", s."revokedAt",
            u."id", u."email", u."firstName", u."lastName", u."status",
            u."isEmailVerified", u."newsletterOptIn", u."notifyOrderUpdates",
            u."notifyCampaigns", u."createdAt"
       FROM "user_sessions" s
       JOIN "users" u ON u."id" = s."userId"
      WHERE s."tokenHash" = ?`,
    tokenHash,
  );

  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt <= nowIso()) return null;
  if (row.status !== 'ACTIVE') return null;

  const permissionRows = await db.all<{ key: string; role: string }>(
    `SELECT DISTINCT p."key" AS "key", r."name" AS "role"
       FROM "user_roles" ur
       JOIN "roles" r ON r."id" = ur."roleId"
       JOIN "role_permissions" rp ON rp."roleId" = r."id"
       JOIN "permissions" p ON p."id" = rp."permissionId"
      WHERE ur."userId" = ?`,
    row.id,
  );

  return {
    sessionId: row.sessionId,
    user: {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
      isEmailVerified: fromBool(row.isEmailVerified),
      newsletterOptIn: fromBool(row.newsletterOptIn),
      notifyOrderUpdates: fromBool(row.notifyOrderUpdates),
      notifyCampaigns: fromBool(row.notifyCampaigns),
      createdAt: row.createdAt,
    },
    permissions: new Set(permissionRows.map((r) => r.key)),
    roles: [...new Set(permissionRows.map((r) => r.role))],
  };
}

/**
 * Issues a new session.
 *
 * Always a fresh row with a fresh token, never a reuse of whatever the client
 * arrived holding — that is what makes session fixation impossible: an
 * attacker who plants a cookie value before sign-in ends up holding a token
 * the server discarded.
 */
export async function createSession(
  db: Db,
  config: AppConfig,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<string> {
  const token = newToken();
  const tokenHash = await hashToken(token, config.sessionSecret);

  await db.run(
    `INSERT INTO "user_sessions" ("id", "userId", "tokenHash", "ip", "userAgent", "expiresAt")
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId(),
    userId,
    tokenHash,
    meta.ip ?? null,
    meta.userAgent?.slice(0, 255) ?? null,
    isoPlusMs(SESSION_TTL_MS),
  );

  return token;
}

/** Revocation is a write, not a cookie deletion — logout must be server-side. */
export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.run(
    `UPDATE "user_sessions" SET "revokedAt" = ? WHERE "id" = ? AND "revokedAt" IS NULL`,
    nowIso(),
    sessionId,
  );
}

/** Used when a password changes: every other device is signed out. */
export async function revokeAllSessions(
  db: Db,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await db.run(
    `UPDATE "user_sessions"
        SET "revokedAt" = ?
      WHERE "userId" = ? AND "revokedAt" IS NULL AND "id" <> ?`,
    nowIso(),
    userId,
    exceptSessionId ?? '',
  );
}

export async function touchSession(db: Db, sessionId: string): Promise<void> {
  await db.run(`UPDATE "user_sessions" SET "lastUsedAt" = ? WHERE "id" = ?`, nowIso(), sessionId);
}

/**
 * Login throttling, recorded on the user row.
 *
 * KV-based rate limiting (http/rate-limit.ts) caps attempts per IP; this caps
 * them per account, so a distributed guess against one email still stops. The
 * lock is short — a legitimate customer who mistypes five times should not be
 * locked out for the afternoon.
 */
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

export async function recordFailedLogin(db: Db, userId: string, attempts: number): Promise<void> {
  const next = attempts + 1;
  const lockedUntil = next >= MAX_FAILED_ATTEMPTS ? isoPlusMs(LOCK_MS) : null;
  await db.run(
    `UPDATE "users" SET "failedLoginAttempts" = ?, "lockedUntil" = ?, "updatedAt" = ? WHERE "id" = ?`,
    next,
    lockedUntil,
    nowIso(),
    userId,
  );
}

export async function clearFailedLogins(db: Db, userId: string): Promise<void> {
  await db.run(
    `UPDATE "users" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = ? WHERE "id" = ?`,
    nowIso(),
    userId,
  );
}

export const isLocked = (lockedUntil: string | null): boolean =>
  lockedUntil !== null && lockedUntil > nowIso();

export { bool };
