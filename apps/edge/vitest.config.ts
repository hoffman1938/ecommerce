import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Building the seed derives two PBKDF2 hashes at 600k iterations, which is
    // deliberately slow. It happens once per process and is cached.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
