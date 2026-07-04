/**
 * Vitest setup for the frontend package.
 *
 * - `@testing-library/jest-dom` extends Vitest's `expect` with the
 *   DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, …).
 * - jsdom supplies the DOM; `vite.config.ts` sets `environment: 'jsdom'`.
 *
 * The setup runs once per test file (not once per test), which is
 * the recommended Vitest pattern.
 */
import '@testing-library/jest-dom/vitest';
