/**
 * Vitest global setup.
 *
 * Runs once before any test file. Sets sane defaults for env vars that
 * production code reads at import time (e.g. `DATABASE_URL`). The
 * postgres.js driver is lazy — it never connects to this URL — so the
 * fake host is harmless. Integration tests that need a real DB (WU4) set
 * `DATABASE_URL` again before the testcontainers container starts.
 */

process.env['DATABASE_URL'] ??= 'postgres://test:test@localhost:5432/shortpulse_test';
process.env['PORT'] ??= '3000';
process.env['BASE_URL'] ??= 'http://localhost:3000';
