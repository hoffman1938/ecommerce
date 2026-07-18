/**
 * Typed, validated environment configuration for server-side apps
 * (API + worker). Frontends read only NEXT_PUBLIC_* variables directly.
 *
 * This is the "environment adapter": every runtime-specific value (URLs,
 * cookie behavior, provider selection, proxy trust) is resolved here so the
 * rest of the codebase never touches process.env.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import { z } from 'zod';

const booleanString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  STOREFRONT_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  API_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1).default('postgresql://outlet:outlet@localhost:5432/outlet'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  STORAGE_PROVIDER: z.enum(['minio', 's3', 'r2']).default('minio'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('outlet-local'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('minio'),
  S3_SECRET_KEY: z.string().default('minio123'),
  S3_FORCE_PATH_STYLE: booleanString,

  EMAIL_PROVIDER: z.enum(['smtp', 'noop']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanString,
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Outlet Marketplace <no-reply@outlet.local>'),

  PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  MOCK_PAYMENT_WEBHOOK_SECRET: z.string().default('local-mock-webhook-secret'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),

  SESSION_SECRET: z.string().min(8).default('local-dev-session-secret-change-me'),
  SESSION_COOKIE_NAME: z.string().default('outlet_session'),
  CART_COOKIE_NAME: z.string().default('outlet_cart'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  COOKIE_SECURE: booleanString,
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUSTED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  CAPTCHA_PROVIDER: z.enum(['none', 'turnstile']).default('none'),
  TURNSTILE_SECRET_KEY: z.string().optional().default(''),

  RESERVATION_DURATION_MINUTES: z.coerce.number().int().positive().default(20),
  DEFAULT_CURRENCY: z.string().length(3).default('EUR'),
  DEFAULT_LOCALE: z.string().default('en'),

  RESERVATION_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  CAMPAIGN_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),

  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  TRUST_PROXY: booleanString,

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
});

export type AppConfig = ReturnType<typeof buildConfig>;

function findEnvFile(): string | undefined {
  // Walk upwards from cwd looking for .env / .env.local so apps can run from
  // their own directory or the repo root. Docker injects env vars directly,
  // so a missing file is fine.
  const candidates = process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env.local', '.env'];
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    for (const name of candidates) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function buildConfig(raw: NodeJS.ProcessEnv) {
  const env = envSchema.parse(raw);
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    urls: {
      storefront: env.STOREFRONT_URL,
      admin: env.ADMIN_URL,
      api: env.API_URL,
    },
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    storage: {
      provider: env.STORAGE_PROVIDER,
      endpoint: env.S3_ENDPOINT,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
    },
    email: {
      provider: env.EMAIL_PROVIDER,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      smtpSecure: env.SMTP_SECURE ?? false,
      smtpUser: env.SMTP_USER,
      smtpPassword: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    },
    payments: {
      provider: env.PAYMENT_PROVIDER,
      mockWebhookSecret: env.MOCK_PAYMENT_WEBHOOK_SECRET,
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    auth: {
      sessionSecret: env.SESSION_SECRET,
      sessionCookieName: env.SESSION_COOKIE_NAME,
      cartCookieName: env.CART_COOKIE_NAME,
      cookieDomain: env.COOKIE_DOMAIN || undefined,
      cookieSecure: env.COOKIE_SECURE ?? false,
      cookieSameSite: env.COOKIE_SAMESITE,
      trustedOrigins: env.TRUSTED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      captchaProvider: env.CAPTCHA_PROVIDER,
      turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    },
    business: {
      reservationDurationMinutes: env.RESERVATION_DURATION_MINUTES,
      defaultCurrency: env.DEFAULT_CURRENCY,
      defaultLocale: env.DEFAULT_LOCALE,
    },
    worker: {
      reservationSweepIntervalSeconds: env.RESERVATION_SWEEP_INTERVAL_SECONDS,
      campaignSweepIntervalSeconds: env.CAMPAIGN_SWEEP_INTERVAL_SECONDS,
    },
    server: {
      port: env.API_PORT,
      host: env.API_HOST,
      trustProxy: env.TRUST_PROXY ?? false,
    },
    rateLimit: {
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      authMaxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    },
  };
}

let cached: AppConfig | undefined;

/** Load, validate, and cache configuration from the environment. */
export function loadConfig(): AppConfig {
  if (cached) return cached;
  const envFile = findEnvFile();
  if (envFile) dotenv.config({ path: envFile });
  cached = buildConfig(process.env);
  return cached;
}

/** Test helper: rebuild config from a modified environment. */
export function reloadConfig(): AppConfig {
  cached = undefined;
  return loadConfig();
}
