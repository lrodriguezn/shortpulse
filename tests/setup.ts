/**
 * Vitest global setup.
 *
 * Runs once before any test file. Sets sane defaults for env vars that
 * production code reads at import time (e.g. `DATABASE_URL`). The
 * postgres.js driver is lazy — it never connects to this URL — so the
 * fake host is harmless. Integration tests that need a real DB (WU4) set
 * `DATABASE_URL` again before the testcontainers container starts.
 *
 * Also wires `@testing-library/jest-dom` matchers (e.g.
 * `toBeInTheDocument`, `toHaveTextContent`) so the frontend's React
 * component tests have the standard DOM assertion vocabulary. The
 * matchers are no-ops under non-jsdom environments; the
 * `environmentMatchGlobs` in the root vitest config ensures they're
 * only invoked where a DOM exists.
 */
import '@testing-library/jest-dom/vitest';

process.env['DATABASE_URL'] ??= 'postgres://test:test@localhost:5432/shortpulse_test';
process.env['PORT'] ??= '3000';
process.env['BASE_URL'] ??= 'http://localhost:3000';
