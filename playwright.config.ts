/**
 * Playwright config — root-level E2E test runner.
 *
 * The E2E suite verifies the three critical user journeys end-to-end:
 *  1. `create-link.e2e.spec.ts` — form submit → row in table, 409 toast,
 *     invalid URL validation, auto-generated slug.
 *  2. `redirect-and-analytics.e2e.spec.ts` — visit `/{slug}` → 302 →
 *     event visible in `/analytics`; 404 for non-existent / deleted slugs.
 *  3. `delete-link.e2e.spec.ts` — delete from the table → slug 404s →
 *     analytics retain the event as `"(deleted link)"`.
 *
 * Design reference: `openspec/changes/add-shortpulse-app/design.md` §10
 * ("E2E: create link → redirect → analytics visible → delete → 404").
 *
 * **Run model.**
 *  - Against a live stack (CI with `docker compose up`): the tests run
 *    for real against `http://localhost:3000` (the Fastify + SPA port).
 *  - Without a live stack (local dev, no Docker): each spec file
 *    pings `/health` in `beforeAll` and calls `test.skip()` when the
 *    stack is unreachable. The tests are reported as "skipped" (not
 *    "failed"), so they don't block local development.
 *
 * **Why no `webServer`.** Playwright's `webServer` option is a
 * convenience for spinning up the SUT. We intentionally do NOT use
 * it here: the E2E suite runs against the docker-compose stack
 * (managed by CI, not Playwright), and against manually-started
 * dev stacks locally. Adding `webServer` would couple Playwright
 * to a specific boot recipe and make the suite harder to wire into
 * Dokploy / CI pipelines.
 *
 * **Parallelism.** `workers: 1` and `fullyParallel: false` keep the
 * suite sequential. The three user journeys share the same database
 * (links + analytics are read and written), and parallel workers
 * would race on slug uniqueness, click counts, and deletion state.
 * The test runtime is bounded by `timeout` (30 s per test) and is
 * well under the 5-minute CI budget even sequentially.
 *
 * **Retries.** CI runs with `CI=1` set by GitHub Actions; we retry
 * once on failure to absorb transient timing on the analytics page
 * (the events table re-fetches after a 300 ms filter debounce, and
 * a slow CI runner can flake on the first run). Local runs do not
 * retry so developers see real failures immediately.
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  // The E2E specs live at the repo root in `e2e/`. Keeping them at
  // the root (not under `packages/frontend/e2e/`) matches the design
  // §10 column and the `work-unit-commits` grouping — the tests
  // exercise BOTH the FE and the BE, so a single root-level
  // directory is the right home.
  testDir: './e2e',
  // Each test gets a generous 30 s budget. The critical-path user
  // journeys (create → redirect → analytics → delete) each fit
  // comfortably under 5 s against a local stack; the 30 s ceiling
  // absorbs cold-start latencies on the first CI run.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Sequential execution — see "Parallelism" above. A shared test
  // database means concurrent workers would race on slug uniqueness
  // and on the `total_clicks` assertion in the redirect spec.
  fullyParallel: false,
  workers: 1,
  // CI uses the dot reporter (cleaner in GitHub Actions logs);
  // local runs use the list reporter so the developer sees each
  // test name and its pass/fail/skip status.
  reporter: process.env['CI'] ? [['dot'], ['html', { open: 'never' }]] : 'list',
  // One retry in CI to absorb first-run flakes (cold Vite build,
  // slow network on the analytics re-fetch). Local runs do not
  // retry — the developer wants to see real failures.
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
