import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the running local stack.
 *
 *   docker compose up --build -d        # full stack + migrations + seed
 *   pnpm --filter @outlet/e2e install-browsers   # once
 *   pnpm test:e2e
 *
 * For a fully clean slate first run `pnpm local:reset` (some flows consume
 * seed data such as the example return request).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // shared database & stock — deterministic ordering matters
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
