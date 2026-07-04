/**
 * Vitest setup for the frontend package.
 *
 * - `@testing-library/jest-dom` extends Vitest's `expect` with the
 *   DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, …).
 * - jsdom supplies the DOM; `vite.config.ts` sets `environment: 'jsdom'`.
 * - The root vitest config sets `globals: false`, which disables
 *   `@testing-library/react`'s default auto-cleanup. We register
 *   `afterEach(cleanup)` here so EVERY test file gets DOM isolation
 *   without needing to import + wire it in each one.
 *
 * The setup runs once per test file (not once per test), which is
 * the recommended Vitest pattern.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
