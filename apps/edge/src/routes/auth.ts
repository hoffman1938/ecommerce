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
import { z } from 'zod';
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
import { hashToken } from '../auth/tokens';
import { requireSession, writeAudit } from '../auth/rbac';
import { mergeAnonymousCart } from '../services/cart';
import {
  changePasswordSchema,
  loginSchema,
  parse,
  readJson,
  registerSchema,
} from '../lib/validate';

export const auth = new Hono<AppEnv>();

/**
 * A hash to verify against when the account does not exist.
 *
 * Without it, an unknown address returns in a millisecond while a known one
 * takes the full PBKDF2 cost — which is a reliable oracle for which addresses
 * have accounts. Verifying against this constant makes both paths cost the same.
 */
/*
 * The iteration count has to match the one real hashes carry, and has to be
 * one workerd will actually run. At 600,000 this constant did the opposite of
 * its job: the derivation threw immediately, `verifyPassword` caught it and
 * returned false, and the unknown-account path became the *fast* one — the
 * timing oracle this exists to close.
 */
const DUMMY_HASH =
  'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const SIGN_IN_FAILED = 'That email and password combination is not recognised.';

/**
 * The current session, as `{ user }` — never the user object bare.
 *
 * Both front ends and the NestJS API implement that envelope: the storefront
 * reads `data.user` for the header, and the admin panel reads
 * `data.user.permissions` to decide whether the account may see the panel at
 * all. Returning the user flat here type-checked on both sides and failed at
 * runtime in the quietest possible way — `undefined.permissions` never threw
 * because the check was `!me.user`, so a Super Admin was told the account had
 * no admin permissions, and the storefront header showed everyone as signed
 * out. Whatever this returns, it has to be the shape the two callers read.
 */
auth.get('/me', async (c) => {
  const { session } = ctxOf(c);
  if (!session) return c.json({ user: null });
  return c.json({
    user: {
      ...session.user,
      roles: session.roles,
      permissions: [...session.permissions],
      isStaff: session.permissions.size > 0,
    },
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

  await writeAudit(ctx.db, null, ctx.ip, {
    action: 'auth.register',
    entityType: 'User',
    entityId: userId,
    actorUserId: userId,
    actorEmail: body.email,
    after: { email: body.email, newsletterOptIn: body.newsletterOptIn },
  });

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
    await writeAudit(ctx.db, null, ctx.ip, {
      action: 'auth.login_failed',
      entityType: 'User',
      entityId: user?.id ?? null,
      actorEmail: body.email,
      // Deliberately not distinguishing "no such account" from "wrong
      // password": the response does not, and neither should the record.
      reason: 'Sign-in refused',
    });
    throw new ApiError('UNAUTHORIZED', SIGN_IN_FAILED);
  }
  // A locked or disabled account gets the same message as a wrong password, so
  // the response never confirms that the address exists.
  if (isLocked(user.lockedUntil) || user.status !== 'ACTIVE') {
    await writeAudit(ctx.db, null, ctx.ip, {
      action: 'auth.login_blocked',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorEmail: body.email,
      reason: isLocked(user.lockedUntil) ? 'Account locked' : 'Account disabled',
    });
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

  /*
   * Whether this sign-in was an administrator's cannot be read from the
   * session — the session is created by this very request. One indexed lookup
   * settles it, and without it every admin sign-in files itself under
   * CUSTOMER, which is exactly the distinction the log exists to draw.
   */
  const staff = await ctx.db.first<{ one: number }>(
    `SELECT 1 AS "one" FROM "user_roles" WHERE "userId" = ? LIMIT 1`,
    user.id,
  );

  await writeAudit(ctx.db, null, ctx.ip, {
    action: 'auth.login',
    entityType: 'User',
    entityId: user.id,
    actorUserId: user.id,
    actorEmail: session?.email ?? body.email,
    actorType: staff ? 'ADMIN' : 'CUSTOMER',
  });

  return c.json(session);
});

auth.post('/logout', async (c) => {
  const ctx = ctxOf(c);
  // Revoked server-side, not just un-cookied: a captured token has to stop
  // working, and deleting the client's copy does not achieve that.
  if (ctx.session) {
    await revokeSession(ctx.db, ctx.session.sessionId);
    await writeAudit(ctx.db, ctx.session, ctx.ip, {
      action: 'auth.logout',
      entityType: 'User',
      entityId: ctx.session.user.id,
    });
  }
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

  await writeAudit(ctx.db, session, ctx.ip, {
    action: 'auth.password_change',
    entityType: 'User',
    entityId: session.user.id,
    reason: 'Other sessions revoked',
  });

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
const RESET_UNAVAILABLE =
  'Password reset needs an email provider, which this demo environment deliberately does not have. Demo account passwords are documented in the README, and a signed-in customer can change theirs from Account → Password.';

auth.post('/forgot-password', async (c) => {
  const ctx = ctxOf(c);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'passwordReset', ctx.ip);
  await readJson(c.req.raw).catch(() => ({}));
  return c.json({
    ok: true,
    message: RESET_UNAVAILABLE,
  });
});

/**
 * The other half of a flow that does not exist here.
 *
 * A reset token only ever arrives in an email, and this deployment sends none,
 * so no valid token can exist. The endpoint answers anyway — with the same
 * explanation `/forgot-password` gives — because a 404 on a page somebody
 * reached from the sign-in screen reads as a broken deployment rather than as
 * a deliberately absent feature. Signed-in customers change their password at
 * `/auth/change-password`, which does work.
 */
auth.post('/reset-password', async (c) => {
  const ctx = ctxOf(c);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'passwordReset', ctx.ip);
  await readJson(c.req.raw).catch(() => ({}));
  throw new ApiError('FEATURE_UNAVAILABLE', RESET_UNAVAILABLE);
});

/**
 * Email verification.
 *
 * The storefront has a `/verify-email` page that posts here, and this route did
 * not exist — so anyone landing on that page, from a bookmark or from a link
 * issued by the NestJS stack, was told "No such endpoint." That is the same
 * failure `/reset-password` above documents: a 404 on a page the site itself
 * ships reads as a broken deployment rather than as a feature this environment
 * does not have.
 *
 * Unlike password reset, though, verification has a true and useful answer here.
 * `/register` sets `isEmailVerified = 1` at creation, precisely because no email
 * can be sent — so an account reaching this page really is verified, and saying
 * so is honest rather than a placation.
 *
 * A genuine token is still honoured if one is ever present: the columns exist,
 * and a database seeded or migrated from the NestJS stack can carry one. Only
 * when there is nothing to check does it fall through to reporting the state
 * registration already put the account in.
 */
auth.post('/verify-email', async (c) => {
  const ctx = ctxOf(c);
  await enforceRateLimit(ctx.env.RATE_LIMIT, 'register', ctx.ip);
  const body = parse(
    z.object({ token: z.string().trim().min(1).max(200) }).strict(),
    await readJson(c.req.raw),
  );

  const hash = await hashToken(body.token, ctx.config.sessionSecret);
  const pending = await ctx.db.first<{ id: string; expiresAt: string | null }>(
    `SELECT "id", "emailVerificationExpiresAt" AS "expiresAt" FROM "users"
      WHERE "emailVerificationTokenHash" IS NOT NULL AND "emailVerificationTokenHash" = ?`,
    hash,
  );

  if (pending) {
    if (pending.expiresAt && pending.expiresAt <= nowIso()) {
      throw new ApiError('BAD_REQUEST', 'That verification link has expired.');
    }
    await ctx.db.run(
      `UPDATE "users"
          SET "isEmailVerified" = 1, "emailVerifiedAt" = ?, "emailVerificationTokenHash" = NULL,
              "emailVerificationExpiresAt" = NULL, "updatedAt" = ?
        WHERE "id" = ?`,
      nowIso(),
      nowIso(),
      pending.id,
    );
    await writeAudit(ctx.db, null, ctx.ip, {
      action: 'auth.email_verified',
      entityType: 'User',
      entityId: pending.id,
      actorUserId: pending.id,
      after: { isEmailVerified: true },
    });
    return c.json({ ok: true, verified: true });
  }

  /*
   * No such token, and none can have been issued. Reporting success is the
   * accurate answer about this deployment — every account is verified from the
   * moment it is created — and it is not a way in: verification grants nothing
   * here, no session is created, and no row was changed.
   */
  return c.json({
    ok: true,
    verified: true,
    message:
      'Accounts in this demo are verified as soon as they are created, so there is nothing to confirm. You can sign in.',
  });
});

export { auth as default };
