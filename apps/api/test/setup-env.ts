/**
 * Integration-test environment. Uses the dedicated outlet_test database so
 * tests can truncate tables freely. Requires `docker compose up -d postgres`
 * (the postgres-init script creates outlet_test automatically).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://outlet:outlet@localhost:5432/outlet_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.MOCK_PAYMENT_WEBHOOK_SECRET = 'test-mock-webhook-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.EMAIL_PROVIDER = 'noop';
process.env.CAPTCHA_PROVIDER = 'none';
