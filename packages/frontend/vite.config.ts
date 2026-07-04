/**
 * Vite config — React plugin + path alias + Vitest (jsdom).
 *
 * `@vitejs/plugin-react` enables Fast Refresh + the automatic JSX
 * runtime. The `@/` alias mirrors the `tsconfig.json` paths so
 * imports like `@/components/ui/button` resolve identically from
 * dev server, build, and tests.
 *
 * `tsconfigPaths()` is NOT used: Vite's `resolve.alias` is enough
 * and avoids a third-party plugin dependency. We keep `@shortpulse/shared`
 * pointing at the workspace source so HMR picks up shared schema
 * changes without rebuilding the shared `dist/`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@shortpulse/shared': path.resolve(here, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
