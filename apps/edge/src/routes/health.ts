/**
 * Health and observability.
 *
 * `/api/health` answers the question a deploy check actually has: can this
 * Worker reach its database and its bucket, and is it configured. It reports
 * *whether* a secret is set, never its value, and names no internal paths.
 */

import { Hono, type Context } from 'hono';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';

export const health = new Hono<AppEnv>();

async function probe(run: () => Promise<unknown>): Promise<'ok' | 'error'> {
  try {
    await run();
    return 'ok';
  } catch {
    return 'error';
  }
}

const handler = async (c: Context<AppEnv>) => {
  const ctx = ctxOf(c);

  const [database, storage] = await Promise.all([
    probe(() => ctx.db.first(`SELECT 1 AS "ok"`)),
    probe(() => ctx.env.MEDIA.head('healthcheck')),
  ]);

  // A demo whose catalogue never got seeded looks identical to a broken one
  // from the outside, so the check reports whether there is anything in it.
  const productCount = await ctx.db
    .count(`SELECT COUNT(*) AS "c" FROM "products" WHERE "status" = 'ACTIVE'`)
    .catch(() => -1);

  const checks = {
    database,
    storage,
    rateLimiter: ctx.env.RATE_LIMIT ? 'ok' : 'not-configured',
    sessionSecret: ctx.env.SESSION_SECRET ? 'configured' : 'using-development-default',
    catalogue: productCount > 0 ? 'seeded' : productCount === 0 ? 'empty' : 'error',
  } as const;

  const healthy = database === 'ok' && productCount > 0;

  return c.json(
    {
      status: healthy ? 'ok' : 'degraded',
      environment: ctx.config.environment,
      demoMode: ctx.config.isDemo,
      activeProducts: productCount >= 0 ? productCount : null,
      checks,
      time: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
};

health.get('/health', handler);
// Pages proxies the API under /api, so both spellings answer.
health.get('/api/health', handler);
