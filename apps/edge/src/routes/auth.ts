/**
 * Registration, sign-in, sign-out.
 *
 * Three properties this file exists to hold:
 *
 *  - **No user enumeration.** A failed sign-in says the same thing whether the
 *    address is unknown, the password is wrong, or the account is locked. The
 *    password verification runs even for an unknown address, so response time
 *    does not answer the question either.
 *  - **A new session on every sign-in.** Never a reuse of whatever cookie the
 *    client arrived with, which is what makes session fixation impossible.
 *  - **Server-side sign-out.** Logging out revokes the row; clearing the cookie
 *    alone would leave a token that still works if it was captured.
 *
 * Password reset is deliberately incomplete: this deployment sends no email, so
 * issuing a reset token would either mean printing it (a takeover primitive) or
 * silently doing nothing. The endpoint accepts the request, records nothing
 * exploitable, and says what it actually did.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';
import { ApiError } from '../lib/errors';
import { enforceRateLimit } from '../http/rate-limit';
import { newId } from '../lib/ids';
import { nowIso } from '../lib/sql';
import { hashPassword, needsRehash, verifyPassword } from '../auth/password';
import {
  clearFailedLogins,
  clearedSessionCookie,
  createSession,
  isLocked,
  recordFailedLogin,
  revokeAllSessions,
  revokeSession,
  sessionCookie,
} from '../auth/session';
import { requireSession } from '../auth/rbac';
import { mergeAnonymousCart } from '../services/cart';
import { changePasswordSchema, loginSchema, parse, readJson, registerSchema } from '../lib/validate';

export const auth = new Hono<AppEnv>();

/**
 * A hash to verify against when the account does not exist.
 *
 * Without it, an unknown address returns in a millisecond while a known one
 * takes the full PBKDF2 cost — which is a reliable oracle for which addresses
 * have accounts. Verifying against this constant makes both paths cost the same.
 */
const DUMMY_HASH =
  'pbkdf2$sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const SIGN_IN_FAILED = 'That email and password combination is not recognised.';

auth.get('/me', async (c) => {
  const { session } = ctxOf(c);
  if (!session) return c.json(null);
  return c.json({
    ...session.user,
    roles: session.roles,
    permissions: [...session.permissions],
    isStaff: session.permissions.size > 0,
  });
});

auth.post('/register', async (c) => {
  const ctx = ctxOf(c);
  const body = parse(registerSchema, await readJson(c.req.raw));
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'register', ctx.ip);

  const existing = await ctx.db.first<{ id: string }>(
    `SELECT "id" FROM "users" WHERE "email" = ?`,
    body.email,
  );
  if (existing) {
    // Registration cannot avoid revealing that an address is taken — the
    // account has to end up owned by exactly one person. Kept generic anyway.
    throw new ApiError('CONFLICT', 'That email address cannot be used to register.');
  }

  const userId = newId();
  await ctx.db.run(
    `INSERT INTO "users" ("id", "email", "passwordHash", "firstName", "lastName",
                          "isEmailVerified", "emailVerifiedAt", "newsletterOptIn")
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    userId,
    body.email,
    await hashPassword(body.password),
    body.firstName,
    body.lastName,
    nowIso(),
    body.newsletterOptIn ? 1 : 0,
  );
  // The demo sends no email, so requiring verification would lock every new
  // account out permanently. Marked verified at creation, and said so here
  // rather than leaving a reader to infer it.

  await ctx.db.run(`INSERT INTO "wishlists" ("id", "userId") VALUES (?, ?)`, newId(), userId);

  const token = await createSession(ctx.db, ctx.config, userId, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  if (ctx.cartToken) await mergeAnonymousCart(ctx.db, ctx.cartToken, userId);
  ctx.setCookies.push(sessionCookie(ctx.config, token));

  return c.json(
    { id: userId, email: body.email, firstName: body.firstName, lastName: body.lastName },
    201,
  );
});

auth.post('/login', async (c) => {
  const ctx = ctxOf(c);
  const body = parse(loginSchema, await readJson(c.req.raw));
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'login', ctx.ip);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'login', body.email);

  const user = await ctx.db.first<{
    id: string;
    passwordHash: string;
    status: string;
    failedLoginAttempts: number;
    lockedUntil: string | null;
  }>(
    `SELECT "id", "passwordHash", "status", "failedLoginAttempts", "lockedUntil"
       FROM "users" WHERE "email" = ?`,
    body.email,
  );

  const correct = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, body.password);

  if (!user || !correct) {
    if (user) await recordFailedLogin(ctx.db, user.id, user.failedLoginAttempts);
    throw new ApiError('UNAUTHORIZED', SIGN_IN_FAILED);
  }
  // A locked or disabled account gets the same message as a wrong password, so
  // the response never confirms that the address exists.
  if (isLocked(user.lockedUntil) || user.status !== 'ACTIVE') {
    throw new ApiError('UNAUTHORIZED', SIGN_IN_FAILED);
  }

  // Raising the KDF cost later should not strand existing accounts: a correct
  // password verified against weaker parameters is re-hashed in place.
  if (needsRehash(user.passwordHash)) {
    await ctx.db.run(
      `UPDATE "users" SET "passwordHash" = ?, "updatedAt" = ? WHERE "id" = ?`,
      await hashPassword(body.password),
      nowIso(),
      user.id,
    );
  }

  await clearFailedLogins(ctx.db, user.id);
  const token = await createSession(ctx.db, ctx.config, user.id, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  if (ctx.cartToken) await mergeAnonymousCart(ctx.db, ctx.cartToken, user.id);
  ctx.setCookies.push(sessionCookie(ctx.config, token));

  const session = await ctx.db.first<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }>(`SELECT "id", "email", "firstName", "lastName" FROM "users" WHERE "id" = ?`, user.id);

  return c.json(session);
});

auth.post('/logout', async (c) => {
  const ctx = ctxOf(c);
  // Revoked server-side, not just un-cookied: a captured token has to stop
  // working, and deleting the client's copy does not achieve that.
  if (ctx.session) await revokeSession(ctx.db, ctx.session.sessionId);
  ctx.setCookies.push(clearedSessionCookie(ctx.config));
  return c.json({ ok: true });
});

auth.post('/change-password', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const body = parse(changePasswordSchema, await readJson(c.req.raw));

  const user = await ctx.db.first<{ passwordHash: string }>(
    `SELECT "passwordHash" FROM "users" WHERE "id" = ?`,
    session.user.id,
  );
  if (!user || !(await verifyPassword(user.passwordHash, body.currentPassword))) {
    throw new ApiError('UNAUTHORIZED', 'Your current password is not correct.');
  }

  await ctx.db.run(
    `UPDATE "users" SET "passwordHash" = ?, "updatedAt" = ? WHERE "id" = ?`,
    await hashPassword(body.newPassword),
    nowIso(),
    session.user.id,
  );
  // Every other device is signed out. A password change is usually a response
  // to suspecting someone else has it.
  await revokeAllSessions(ctx.db, session.user.id, session.sessionId);

  return c.json({ ok: true, otherSessionsRevoked: true });
});

auth.get('/sessions', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  const rows = await ctx.db.all<{
    id: string;
    createdAt: string;
    lastUsedAt: string;
    userAgent: string | null;
  }>(
    `SELECT "id", "createdAt", "lastUsedAt", "userAgent"
       FROM "user_sessions"
      WHERE "userId" = ? AND "revokedAt" IS NULL AND "expiresAt" > ?
      ORDER BY "lastUsedAt" DESC`,
    session.user.id,
    nowIso(),
  );
  // The IP each session was created from is stored for abuse investigation but
  // is not echoed back to the browser.
  return c.json(rows.map((row) => ({ ...row, current: row.id === session.sessionId })));
});

auth.post('/sessions/revoke-others', async (c) => {
  const ctx = ctxOf(c);
  const session = requireSession(ctx.session);
  await revokeAllSessions(ctx.db, session.user.id, session.sessionId);
  return c.json({ ok: true });
});

/**
 * Password reset, in a deployment with no email.
 *
 * Returning a token here would hand anyone who knows an address the ability to
 * take over that account, so it does not. The response is deliberately the
 * same whether or not the address exists.
 */
auth.post('/forgot-password', async (c) => {
  const ctx = ctxOf(c);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'passwordReset', ctx.ip);
  await readJson(c.req.raw).catch(() => ({}));
  return c.json({
    ok: true,
    message:
      'Password reset needs an email provider, which this demo environment deliberately does not have. Demo account passwords are documented in the README.',
  });
});

export { auth as default };
