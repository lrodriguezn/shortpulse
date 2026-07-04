import { defineConfig } from 'vitest/config';

/**
 * Root vitest config. Tests live under `tests/` and in each package.
 * Coverage applies only to package `src/` directories to avoid penalising
 * config-sanity tests during the scaffold phase.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@shortpulse/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
