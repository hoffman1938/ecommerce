/**
 * Media, served from R2.
 *
 * Two rules:
 *
 *  1. **A requested key is never a path the client controls.** It is validated
 *    against a strict character set, rejected if it contains a traversal
 *    segment, and only keys under the known prefixes are served — so `GET
 *    /media/../secrets` and `GET /media/backups/db.sql` both fail before R2 is
 *    touched.
 *  2. **A missing object is not a broken image.** The catalogue's artwork is
 *    generated from `@outlet/catalog`, so when R2 has no object for a product
 *    the Worker renders the same SVG on the fly. The storefront therefore has
 *    working imagery on a bucket that has never been populated, and populating
 *    it later is a pure performance change.
 */

import { Hono } from 'hono';
import {
  CAMPAIGNS,
  PRODUCTS,
  brandArtworkSvg,
  campaignArtworkItems,
  campaignArtworkSvg,
  categoryArtworkSvg,
  productArtworkSvg,
  type ProductShape,
  type ProductView,
} from '@outlet/catalog';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';
import { ApiError, notFound } from '../lib/errors';

export const media = new Hono<AppEnv>();

/** Prefixes the bucket serves publicly. Anything else is not addressable. */
const PUBLIC_PREFIXES = ['products/', 'campaigns/', 'categories/', 'brands/', 'uploads/'];

/**
 * Validates an object key.
 *
 * Deliberately an allow-list of characters rather than a search for `..`:
 * encodings and alternate separators make blocking traversal by pattern a game
 * you lose eventually, whereas "letters, digits, dot, dash, underscore and
 * slash" has no traversal expressible inside it once empty and dot segments
 * are rejected.
 */
export function validateObjectKey(key: string): string {
  if (!key || key.length > 300) throw notFound('No such file.');
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key)) throw notFound('No such file.');
  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw notFound('No such file.');
  }
  if (!PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))) throw notFound('No such file.');
  return key;
}

const CONTENT_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

const contentTypeFor = (key: string): string =>
  CONTENT_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

const productBySlug = new Map(PRODUCTS.map((spec) => [spec.slug, spec]));

/**
 * Renders the artwork a key names, when the bucket has no object for it.
 *
 * Keys follow the shape the seed writes:
 *   products/{slug}/{colour}-{view}.svg
 *   campaigns/{slug}.svg
 *   categories/{slug}.svg
 *   brands/{slug}.svg
 */
function renderFallback(key: string): string | null {
  const [prefix, ...rest] = key.split('/');

  if (prefix === 'products' && rest.length === 2) {
    const spec = productBySlug.get(rest[0]);
    if (!spec) return null;
    const file = rest[1].replace(/\.[a-z0-9]+$/i, '');
    const view = (['front', 'back', 'detail'] as ProductView[]).find((candidate) =>
      file.endsWith(`-${candidate}`),
    );
    if (!view) return null;
    const colourSlug = file.slice(0, file.length - view.length - 1);
    const color =
      spec.colors.find(
        (candidate) => candidate.toLowerCase().replace(/[^a-z0-9]+/g, '-') === colourSlug,
      ) ?? spec.colors[0];
    return productArtworkSvg({
      shape: spec.shape as ProductShape,
      color,
      brandName: spec.brand,
      productName: spec.name,
      view,
    });
  }

  const slug = rest.join('/').replace(/\.[a-z0-9]+$/i, '');
  if (prefix === 'campaigns' && slug) {
    // A campaign cover shows the campaign's own merchandise. The lookup is
    // against the shipped catalogue; a campaign created in the admin panel
    // falls back to an empty arrangement rather than failing.
    const campaign = CAMPAIGNS.find((entry) => entry.slug === slug);
    const items = campaignArtworkItems(campaign?.productSlugs ?? [], (productSlug) =>
      productBySlug.get(productSlug),
    );
    return campaignArtworkSvg(slug, items);
  }
  if (prefix === 'categories' && slug) return categoryArtworkSvg(slug, slug.replace(/-/g, ' '));
  if (prefix === 'brands' && slug) return brandArtworkSvg(slug.replace(/-/g, ' '));
  return null;
}

media.get('/media/*', async (c) => {
  const ctx = ctxOf(c);
  const raw = new URL(c.req.url).pathname.slice('/media/'.length);
  const key = validateObjectKey(decodeURIComponent(raw));

  const object = await ctx.env.MEDIA.get(key).catch(() => null);
  if (object) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-type', object.httpMetadata?.contentType ?? contentTypeFor(key));
    // Product artwork is immutable per key; a new image gets a new key.
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { headers });
  }

  const svg = renderFallback(key);
  if (!svg) throw notFound('No such file.');

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Shorter, because uploading the real object should start being served
      // reasonably soon after it lands rather than a year later.
      'cache-control': 'public, max-age=3600',
      'x-media-source': 'generated',
    },
  });
});

// --- Admin upload ------------------------------------------------------------

/** Only these may be stored. An SVG is excluded: it can carry script. */
const ALLOWED_UPLOAD_TYPES: Record<string, { extension: string; magic: number[][] }> = {
  'image/jpeg': { extension: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { extension: 'png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { extension: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Decides an upload's type from its bytes, not its headers.
 *
 * `Content-Type` and the filename are both attacker-controlled. The magic
 * number is the only part of an upload that describes what it actually is, so
 * the declared type has to agree with it or the upload is refused.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  for (const [mime, spec] of Object.entries(ALLOWED_UPLOAD_TYPES)) {
    for (const signature of spec.magic) {
      if (signature.every((byte, index) => bytes[index] === byte)) {
        // RIFF also fronts .wav and .avi, so WebP needs its second marker too.
        if (mime === 'image/webp') {
          const webp = [0x57, 0x45, 0x42, 0x50];
          if (!webp.every((byte, index) => bytes[8 + index] === byte)) continue;
        }
        return mime;
      }
    }
  }
  return null;
}

export const extensionFor = (mime: string): string =>
  ALLOWED_UPLOAD_TYPES[mime]?.extension ?? 'bin';

export function assertUploadable(declaredType: string, bytes: Uint8Array): string {
  if (bytes.byteLength === 0) throw new ApiError('BAD_REQUEST', 'That file is empty.');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'Images must be 5 MB or smaller.');
  }
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image.');
  }
  if (declaredType && declaredType.split(';')[0].trim() !== sniffed) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'That file is not the type it claims to be.');
  }
  return sniffed;
}
