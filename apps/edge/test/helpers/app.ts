/**
 * Boots the real Worker against an in-process database.
 *
 * Requests go through the actual Hono app — the same middleware, the same
 * routes, the same error handler — so a test that signs in and places an order
 * exercises the code that would run in production, not a rehearsal of it.
 *
 * Cookies are kept per client because that is the whole authentication
 * mechanism: a test that forgets to carry them is a test that is not signed in,
 * which is exactly the distinction several of these assertions rely on.
 */

import { createApp } from '../../src/http/app';
import type { Env } from '../../src/env';
import { createSeededDatabase, type TestDatabase } from './d1';

const ORIGIN = 'http://localhost:3000';
const BASE = 'http://api.test';

/**
 * Every Set-Cookie on a response, separately.
 *
 * `Headers.getSetCookie()` exists in both Node and workerd but is absent from
 * @cloudflare/workers-types, so it is reached through a narrow assertion here
 * rather than by loosening the types everywhere it is used.
 */
export function setCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

/** An R2 stand-in. Enough surface for the media route and uploads. */
class StubR2 {
  private readonly objects = new Map<string, { body: Uint8Array; contentType?: string }>();

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: object.body,
      httpEtag: `"${key}"`,
      httpMetadata: { contentType: object.contentType },
      writeHttpMetadata: (headers: Headers) => {
        if (object.contentType) headers.set('content-type', object.contentType);
      },
    };
  }

  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }

  async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, { body: value, contentType: options?.httpMetadata?.contentType });
    return { key };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  size() {
    return this.objects.size;
  }
}

/** A KV stand-in, so rate-limit behaviour can be asserted rather than skipped. */
class StubKV {
  private readonly entries = new Map<string, string>();
  async get(key: string) {
    return this.entries.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.entries.set(key, value);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
}

export interface TestClientOptions {
  /** Omit the Origin header, as a non-browser caller would. */
  noOrigin?: boolean;
  /** Send a different Origin, as a cross-site attacker's page would. */
  origin?: string;
}

export class TestClient {
  private cookies = new Map<string, string>();

  constructor(
    private readonly app: ReturnType<typeof createApp>,
    private readonly env: Env,
    private readonly options: TestClientOptions = {},
  ) {}

  private headers(hasBody: boolean): Headers {
    const headers = new Headers();
    if (hasBody) headers.set('content-type', 'application/json');
    if (!this.options.noOrigin) headers.set('origin', this.options.origin ?? ORIGIN);
    if (this.cookies.size > 0) {
      headers.set(
        'cookie',
        [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }
    return headers;
  }

  private absorbCookies(response: Response): void {
    // `getSetCookie` returns each Set-Cookie separately, which matters when a
    // response issues both a session and a cart cookie. It is missing from
    // @cloudflare/workers-types' Headers but present in both runtimes.
    for (const header of setCookieHeaders(response)) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: any; response: Response }> {
    const init: RequestInit = { method, headers: this.headers(body !== undefined) };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await this.app.fetch(new Request(`${BASE}${path}`, init), this.env);
    this.absorbCookies(response);

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as any, response };
  }

  get = (path: string) => this.request('GET', path);
  post = (path: string, body?: unknown) => this.request('POST', path, body ?? {});
  patch = (path: string, body?: unknown) => this.request('PATCH', path, body ?? {});
  delete = (path: string) => this.request('DELETE', path);

  /**
   * A multipart upload, carrying this client's cookies.
   *
   * Content-Type is left for fetch to set, because a multipart body needs the
   * boundary it generates.
   */
  async upload(
    path: string,
    file: { bytes: string | Uint8Array; type: string; name: string },
  ): Promise<{ status: number; body: any; response: Response }> {
    const form = new FormData();
    form.append('file', new Blob([file.bytes], { type: file.type }), file.name);

    const headers = this.headers(false);
    const response = await this.app.fetch(
      new Request(`${BASE}${path}`, { method: 'POST', headers, body: form }),
      this.env,
    );
    this.absorbCookies(response);
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as any, response };
  }

  hasCookie = (name: string) => this.cookies.has(name);
  clearCookies = () => this.cookies.clear();
}

export interface TestHarness {
  database: TestDatabase;
  env: Env;
  media: StubR2;
  kv: StubKV;
  client(options?: TestClientOptions): TestClient;
  close(): void;
}

export async function createHarness(overrides: Partial<Env> = {}): Promise<TestHarness> {
  const database = await createSeededDatabase();
  const media = new StubR2();
  const kv = new StubKV();

  const env = {
    DB: database.d1 as unknown as D1Database,
    MEDIA: media as unknown as R2Bucket,
    RATE_LIMIT: kv as unknown as KVNamespace,
    ENVIRONMENT: 'demo',
    DEMO_MODE: 'true',
    ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET: 'test-session-secret-not-used-anywhere-real',
    ...overrides,
  } as Env;

  const app = createApp();

  return {
    database,
    env,
    media,
    kv,
    client: (options?: TestClientOptions) => new TestClient(app, env, options),
    close: () => database.close(),
  };
}

export { ORIGIN };
