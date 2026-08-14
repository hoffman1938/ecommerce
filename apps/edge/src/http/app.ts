/**
 * The Worker's HTTP surface.
 *
 * Assembly order matters: security headers and the CSRF origin check wrap
 * everything, the request context is built once per request, and the error
 * handler is last so that anything thrown anywhere — including inside the
 * middleware — becomes a safe JSON body rather than a stack trace.
 */

import { Hono } from 'hono';
import type { AppEnv } from './context';
import { buildContext } from './context';
import { toErrorResponse } from '../lib/errors';
import { security } from './security';
import { storefront } from '../routes/storefront';
import { admin } from '../routes/admin';
// Imported for its side effect: it registers further routes on `admin`.
import '../routes/admin-manage';
import { media } from '../routes/media';
import { health } from '../routes/health';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', security);

  app.use('*', async (c, next) => {
    c.set('ctx', await buildContext(c));
    await next();
    // Handlers append cookies to the context rather than touching the response,
    // so a route that both sets a cookie and returns JSON does not have to
    // reconstruct the response to do it.
    for (const cookie of c.get('ctx').setCookies) c.res.headers.append('set-cookie', cookie);
  });

  app.route('/', health);
  app.route('/', media);
  app.route('/', storefront);
  app.route('/admin', admin);

  app.notFound((c) =>
    c.json(
      { code: 'NOT_FOUND', message: 'No such endpoint.', requestId: c.req.header('cf-ray') ?? '' },
      404,
    ),
  );

  /**
   * The single place a non-2xx body is produced.
   *
   * The detail goes to the Worker's log; the client gets a code, a sentence
   * written for a shopper, and the request id to quote. A D1 error message
   * routinely contains the failing SQL, which is exactly why none of them
   * reaches a response.
   */
  app.onError((error, c) => {
    const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
    const { status, body, logDetail } = toErrorResponse(error, requestId);

    if (logDetail) {
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          status,
          code: body.code,
          detail: logDetail,
        }),
      );
    }
    return c.json(body, status as 400);
  });

  return app;
}
