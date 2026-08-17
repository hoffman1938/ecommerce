/**
 * Transport-level security: CORS, CSRF, response headers, body limits.
 *
 * The frontend (Pages) and this API (Workers) are on different registrable
 * domains, so every browser call here is cross-origin and credentialed. That
 * shapes three decisions:
 *
 *  - CORS reflects an origin only if it is on the configured allow-list.
 *    `Access-Control-Allow-Origin: *` is never sent, because it cannot be
 *    combined with credentials and would be wrong here even if it could.
 *  - Because the session cookie must be `SameSite=None` to survive the
 *    cross-site hop, SameSite is not doing CSRF work. So every state-changing
 *    request is required to carry an `Origin` (or `Referer`) that is on the
 *    same allow-list, and is rejected before the handler runs if it does not.
 *    This is a check on the *request*, not a response header an attacker's
 *    browser is free to ignore — it does not rely on CORS to protect anything.
 *  - Response headers are set on every reply including errors, so a 500 is as
 *    locked down as a 200.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import { ApiError } from '../lib/errors';
import { readConfig } from '../env';
import type { AppEnv } from './context';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Bodies larger than this are refused before being read into memory. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Endpoints that carry a document rather than a form, and are allowed an
 * upload-sized body despite being JSON.
 *
 * CSV import is the whole reason this exists. 64 KB is a generous limit for a
 * form and far too small for a spreadsheet: the panel's own products export is
 * around 500 KB, so exporting the catalogue, editing it and importing it back —
 * the round trip those two buttons exist to make — failed at the transport layer
 * with `413` before any handler ran. The import schema's own 1,000,000-character
 * cap was unreachable, so the two limits disagreed about what was allowed.
 *
 * Kept as an explicit list of paths rather than a rule about size, so widening
 * the limit stays a decision somebody makes per endpoint.
 */
const DOCUMENT_BODY_PATHS = new Set(['/admin/products/import/csv', '/admin/inventory/import/csv']);

function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

/**
 * A JSON API serves no HTML and loads no subresources, so the strictest
 * possible policy is also the correct one: nothing may be loaded, nothing may
 * frame it, and no plugin content exists.
 *
 * Two responses are not JSON and are handled by name rather than by loosening
 * the policy for everything: catalogue media, which other origins are meant to
 * embed, and the printable invoice and packing slip, which are HTML documents
 * this API generates itself. Those need `style-src 'unsafe-inline'` for their
 * own `<style>` block — under `default-src 'none'` the browser fetched the
 * document, refused the stylesheet, and printed an unformatted invoice. Scripts
 * stay forbidden: these documents contain none, and never should.
 */
function securityHeaders(
  headers: Headers,
  isDevelopment: boolean,
  isMedia = false,
  isDocument = false,
): void {
  headers.set(
    'Content-Security-Policy',
    isDocument
      ? "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  headers.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  );

  /*
   * Media is the one thing here another origin is *supposed* to embed.
   *
   * `same-site` is right for the JSON API — nothing should be able to pull a
   * response into another site's page. It is wrong for images, and wrong for
   * the same reason session cookies here need `SameSite=None`: the storefront
   * is on `*.pages.dev` and this Worker on `*.workers.dev`, and both are
   * public suffixes, so the two are cross-*site*, not merely cross-origin.
   * Under `same-site` the browser fetched every product image successfully and
   * then refused to render it — 200s in the network panel, blank tiles on the
   * page, and no CORS error to go looking for.
   *
   * `cross-origin` on media only. These are public catalogue images; there is
   * nothing in them to leak, and CORP is not what protects the API.
   */
  headers.set('Cross-Origin-Resource-Policy', isMedia ? 'cross-origin' : 'same-site');

  if (!isDevelopment) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export const security: MiddlewareHandler<AppEnv> = async (c, next) => {
  const config = readConfig(c.env);
  const origin = c.req.header('origin') ?? null;
  const allowed = originAllowed(origin, config.allowedOrigins);

  // Preflight is answered here and never reaches a route.
  if (c.req.method === 'OPTIONS') {
    const headers = new Headers();
    if (allowed && origin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set(
        'Access-Control-Allow-Headers',
        c.req.header('access-control-request-headers') ?? 'content-type',
      );
      headers.set('Access-Control-Max-Age', '86400');
    }
    headers.set('Vary', 'Origin');
    securityHeaders(headers, config.isDevelopment);
    return new Response(null, { status: 204, headers });
  }

  if (MUTATING_METHODS.has(c.req.method)) {
    assertSameSiteRequest(c, config.allowedOrigins);
    assertBodyWithinLimit(c);
  }

  await next();

  const headers = c.res.headers;
  if (allowed && origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  headers.append('Vary', 'Origin');
  securityHeaders(
    headers,
    config.isDevelopment,
    isMediaPath(c.req.url),
    // Read from what the handler actually produced rather than from a list of
    // paths, so a future HTML response cannot be added without its policy.
    (headers.get('content-type') ?? '').includes('text/html'),
  );
};

/** Catalogue imagery, which other origins are meant to embed. */
const isMediaPath = (url: string): boolean => new URL(url).pathname.startsWith('/media/');

/**
 * The CSRF gate.
 *
 * A cross-site form post from an attacker's page carries that page's Origin.
 * Requiring the header to be present *and* on the allow-list rejects it,
 * whereas a genuine call from the storefront passes. Non-browser callers
 * (curl, tests) send no Origin at all; those are only allowed through when
 * they also send no cookie, so an unauthenticated public GET-equivalent still
 * works while nothing can act on a signed-in user's behalf without proving
 * where it came from.
 */
export function assertSameSiteRequest(c: Context<AppEnv>, allowedOrigins: string[]): void {
  const origin = c.req.header('origin');
  const hasCookie = Boolean(c.req.header('cookie'));

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      throw new ApiError('FORBIDDEN', 'This request did not come from a recognised origin.');
    }
    return;
  }

  const referer = c.req.header('referer');
  if (referer) {
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      throw new ApiError('FORBIDDEN', 'This request did not come from a recognised origin.');
    }
    if (!allowedOrigins.includes(refererOrigin)) {
      throw new ApiError('FORBIDDEN', 'This request did not come from a recognised origin.');
    }
    return;
  }

  if (hasCookie) {
    throw new ApiError('FORBIDDEN', 'This request did not come from a recognised origin.');
  }
}

function assertBodyWithinLimit(c: Context<AppEnv>): void {
  const declared = c.req.header('content-length');
  if (!declared) return;
  const length = Number.parseInt(declared, 10);
  if (!Number.isFinite(length)) return;

  const contentType = c.req.header('content-type') ?? '';
  const limit =
    contentType.includes('multipart/form-data') ||
    DOCUMENT_BODY_PATHS.has(new URL(c.req.url).pathname)
      ? MAX_UPLOAD_BYTES
      : MAX_JSON_BODY_BYTES;
  if (length > limit) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'That request body is too large.');
  }
}

/** Best-effort client address, used for rate limiting and audit rows. */
export function clientIp(c: Context<AppEnv>): string | null {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

export type { Next };
