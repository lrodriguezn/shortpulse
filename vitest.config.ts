import { defineConfig } from 'vitest/config';

/**
 * Root vitest config. Tests live under `tests/` and in each package.
 * Coverage applies only to package `src/` directories to avoid penalising
 * config-sanity tests during the scaffold phase.
 *
 * The default environment is `node` (matches the backend, shared, and
 * root `tests/` config-sanity tests). Frontend `.tsx` tests use
 * jsdom — we route them via `environmentMatchGlobs` so the React +
 * DOM-dependent tests in `packages/frontend/src/**` get a real DOM.
 * The frontend's own `vite.config.ts` (used by
 * `pnpm --filter @shortpulse/frontend test`) defaults to jsdom too.
 */
export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'docker/**/*.test.ts',
      'packages/*/tests/**/*.test.ts',
      'packages/*/src/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    environmentMatchGlobs: [['packages/frontend/src/**/*.test.tsx', 'jsdom']],
    globals: false,
  },
  resolve: {
    alias: {
      '@shortpulse/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
