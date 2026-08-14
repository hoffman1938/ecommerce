/**
 * Per-request context.
 *
 * Handlers receive one object holding everything they are allowed to reach:
 * the database, the resolved configuration, the caller's session, and the ids
 * used for logging. Nothing reads a global; nothing constructs its own D1
 * handle. That keeps "who is asking" a parameter rather than an assumption.
 */

import type { Context } from 'hono';
import type { AppConfig, Env } from '../env';
import { readConfig } from '../env';
import { Db } from '../lib/sql';
import type { AuthenticatedSession } from '../auth/session';
import { CART_COOKIE, SESSION_COOKIE, readCookie, resolveSession } from '../auth/session';
import { clientIp } from './security';

export interface RequestContext {
  env: Env;
  config: AppConfig;
  db: Db;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  session: AuthenticatedSession | null;
  /** Anonymous cart token from the cookie, if the caller had one. */
  cartToken: string | null;
  /** Set by a handler when a cookie must be issued on the way out. */
  setCookies: string[];
}

export type AppEnv = {
  Bindings: Env;
  Variables: { ctx: RequestContext };
};

export async function buildContext(c: Context<AppEnv>): Promise<RequestContext> {
  const config = readConfig(c.env);
  const db = new Db(c.env.DB);
  const cookieHeader = c.req.header('cookie');

  return {
    env: c.env,
    config,
    db,
    // Cloudflare gives every request a ray id; falling back to a random one
    // keeps local development consistent with production.
    requestId: c.req.header('cf-ray') ?? crypto.randomUUID(),
    ip: clientIp(c),
    userAgent: c.req.header('user-agent') ?? null,
    session: await resolveSession(db, config, readCookie(cookieHeader, SESSION_COOKIE)),
    cartToken: readCookie(cookieHeader, CART_COOKIE),
    setCookies: [],
  };
}

export const ctxOf = (c: Context<AppEnv>): RequestContext => c.get('ctx');
