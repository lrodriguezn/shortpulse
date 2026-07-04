/**
 * Shared E2E helpers — base URL, stack reachability check, unique
 * slug generation.
 *
 * Every spec file imports from here so the skip-strategy and the
 * base-URL resolution live in exactly one place. Changing the
 * health endpoint or the port only needs a single edit.
 */

/**
 * Resolve the base URL for the E2E suite. Honours the
 * `PLAYWRIGHT_BASE_URL` env var (used in CI to point at a
 * non-default host/port); falls back to `http://localhost:3000`
 * (the Fastify port — see `design.md` §1 + §11).
 */
export const BASE_URL: string = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

/**
 * Probe the stack via `/health`. Returns `true` only when the
 * endpoint responds with a 2xx within the 5 s timeout. The
 * `request` fixture is the Playwright `APIRequestContext` —
 * it shares cookies / storage state with the test's browser
 * context, but here we just want a lightweight ping.
 *
 * The 5 s timeout is a balance: long enough to absorb a slow
 * first-paint of the Vite dev server / a cold docker-compose
 * stack; short enough to keep the `pnpm e2e` loop responsive
 * when Docker truly isn't available.
 */
export async function isStackReachable(request: {
  get: (
    url: string,
    opts?: { timeout?: number },
  ) => Promise<{ ok: () => boolean; status: () => number }>;
}): Promise<boolean> {
  try {
    const res = await request.get('/health', { timeout: 5000 });
    return res.ok();
  } catch {
    return false;
  }
}

/**
 * Generate a slug that is unique per test invocation. Combines
 * a caller-provided prefix with the current millisecond timestamp
 * in base-36 so the slug stays in the spec-locked charset
 * (`[a-z0-9-]`, 3-20 chars) and is virtually impossible to collide
 * between sequential test runs.
 *
 * Example: `create('my-link')` → `my-link-l8x3kq2` (18 chars).
 */
export function uniqueSlug(prefix: string): string {
  const stamp = Date.now().toString(36);
  const slug = `${prefix}-${stamp}`;
  // Defensive: if the prefix is long enough to push the slug
  // past 20 chars, trim. The custom-slug regex is 3-20 chars.
  if (slug.length > 20) return slug.slice(0, 20);
  return slug;
}
