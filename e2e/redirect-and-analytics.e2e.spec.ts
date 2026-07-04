/**
 * E2E: redirect-and-analytics — the redirect hot path and the
 * analytics dashboard.
 *
 * Spec coverage:
 *  - `openspec/specs/links/spec.md` requirement #4 + scenarios
 *    "Redirect records analytics and returns 302",
 *    "Redirect for deleted slug returns 404",
 *    "Reserved route does not redirect".
 *  - `openspec/specs/analytics/spec.md` requirement #1 + scenario
 *    "Record event on redirect", and requirement #2 ("Summary
 *    KPIs") via the visible `total_clicks` delta after a click.
 *
 * The redirect + analytics flow is the most important user journey
 * in the app: a click on a short URL is the ENTIRE product. The
 * tests assert BOTH the server-side contract (302 + Location
 * header, analytics event recorded, 404 for deleted slugs) AND
 * the user-visible result (the event appears in the
 * `/analytics` page KPIs and events table).
 *
 * **Why use `page.request` for the redirect.** A real browser
 * `page.goto('/{slug}')` would follow the 302 to example.com
 * (a third-party domain). That introduces a network round-trip
 * to a domain the E2E suite doesn't own and that may be blocked
 * by CI firewalls. The `page.request` API hits the BE directly
 * with `maxRedirects: 0` and asserts the 302 + `Location` header
 * verbatim — the same contract the browser would observe on the
 * wire, but without the third-party hop.
 *
 * **Why assert the `total_clicks` KPI delta.** A direct query
 * to `GET /api/analytics` after the redirect is faster but less
 * user-facing. Verifying the KPI delta via the `/analytics` page
 * proves the spec contract: the events table is the source of
 * truth for the KPIs, and a successful redirect MUST increment
 * `total_clicks` (per spec analytics #2).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

import { BASE_URL, isStackReachable, uniqueSlug } from './helpers.js';

test.beforeAll(async ({ request }) => {
  const reachable = await isStackReachable(request);
  if (!reachable) {
    test.skip(
      true,
      `Stack not reachable at ${BASE_URL} — start docker compose up or pnpm dev to run E2E`,
    );
  }
});

/**
 * Thin wrapper around `POST /api/links` that asserts the 201
 * response and returns the parsed body. Centralizing the
 * "create a link for the test" ritual keeps each test focused
 * on the scenario it actually exercises.
 */
async function createLinkViaApi(
  request: APIRequestContext,
  body: { original_url: string; slug: string },
): Promise<{ id: string; original_url: string; slug: string; short_url: string }> {
  const res = await request.post(`${BASE_URL}/api/links`, { data: body });
  expect(res.status(), `POST /api/links returned ${res.status()}`).toBe(201);
  return (await res.json()) as {
    id: string;
    original_url: string;
    slug: string;
    short_url: string;
  };
}

test.describe('Redirect + analytics', () => {
  test('GET /:slug returns 302 with the Location header set to the original URL', async ({
    request,
  }) => {
    const slug = uniqueSlug('redir');
    const originalUrl = 'https://example.com/redirect-target';
    await createLinkViaApi(request, { original_url: originalUrl, slug });

    // maxRedirects: 0 → the response is the 302 itself, not the
    // followed redirect. This is the canonical way to assert
    // a redirect's `Location` header in Playwright.
    const redirectRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(redirectRes.status()).toBe(302);
    expect(redirectRes.headers()['location']).toBe(originalUrl);
  });

  test('after a redirect, the analytics dashboard shows the click in KPIs and the events table', async ({
    page,
    request,
  }) => {
    const slug = uniqueSlug('anlyt');
    const originalUrl = 'https://example.com/analytics-target';
    await createLinkViaApi(request, { original_url: originalUrl, slug });

    // Capture the baseline KPI so the test doesn't depend on
    // an empty database. The KPI is the source of truth for
    // "was the click recorded?" (spec analytics #2).
    const before = (await (await request.get(`${BASE_URL}/api/analytics/summary`)).json()) as {
      total_clicks: number;
    };
    const beforeClicks = before.total_clicks;

    // Trigger the redirect — this synchronously records one
    // analytics event (per design ADR-002) before returning 302.
    const redirectRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(redirectRes.status()).toBe(302);

    // The KPIs MUST have increased by exactly 1. Using `>= 1`
    // would also pass, but the spec says "one event per click"
    // so an exact delta is the right contract.
    const after = (await (await request.get(`${BASE_URL}/api/analytics/summary`)).json()) as {
      total_clicks: number;
    };
    expect(after.total_clicks - beforeClicks).toBe(1);

    // Navigate to the analytics page and verify the event is
    // visible. The events table is paginated (default page_size
    // 20) and sorted by timestamp DESC, so the new event is on
    // page 1.
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();

    // The events table has a "Link" column. The cell renders the
    // slug for active links. The slug is the most reliable
    // selector because it's the unique identifier of the link
    // we just created.
    await expect(page.getByText(slug, { exact: true })).toBeVisible();

    // The "Clicks totales" KPI card should also reflect the
    // new total. We re-fetch the summary and assert the page
    // shows the same number — proves the FE renders the BE's
    // value verbatim (no client-side caching that would mask
    // the increment).
    const kpi = page.locator('dt', { hasText: 'Clicks totales' }).locator('..').locator('dd');
    const displayedClicks = Number((await kpi.textContent())?.replace(/[^0-9]/g, '') ?? '0');
    expect(displayedClicks).toBe(after.total_clicks);
  });

  test('visiting a non-existent slug shows the 404 page', async ({ page }) => {
    // An invalid-format slug (2 chars, fails CUSTOM_SLUG_REGEX)
    // delegates to the not-found handler in the redirect route's
    // preHandler, which triggers the static plugin's SPA fallback
    // (serves `index.html`). The SPA's TanStack Router then
    // renders the `routes/$.tsx` 404 page.
    //
    // The spec scenario is "Redirect for deleted slug returns
    // 404" — the user-visible result is the same 404 page for
    // any path that isn't a valid redirect target. This test
    // exercises the SPA-fallback path; the deleted-slug path
    // is covered below.
    await page.goto('/ab');
    await expect(page.getByText('El enlace solicitado no existe.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  });

  test('a deleted link slug returns 404 and the event is retained in analytics', async ({
    page,
    request,
  }) => {
    const slug = uniqueSlug('del-anl');
    const originalUrl = 'https://example.com/deleted-analytics-target';
    const created = await createLinkViaApi(request, { original_url: originalUrl, slug });

    // Click once so there is an analytics event to retain.
    const clickRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(clickRes.status()).toBe(302);

    // Soft-delete the link.
    const deleteRes = await request.delete(`${BASE_URL}/api/links/${created.id}`);
    expect(deleteRes.status()).toBe(204);

    // The redirect MUST now return 404 (spec links #3 + scenario
    // "Redirect for deleted slug returns 404"). We use the
    // request API because the BE returns 404 problem-details
    // (not the SPA 404 page) for valid-format deleted slugs.
    const afterDeleteRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(afterDeleteRes.status()).toBe(404);

    // The analytics event MUST still be visible — spec
    // analytics #5 ("Retention after soft-delete"). The event
    // row renders the `(deleted link)` presentation label when
    // the link is soft-deleted, so we filter the events table
    // by the original link_id to make the assertion robust
    // against other events in the DB.
    await page.goto('/analytics');
    // The events table has a "Link ID" filter input (text
    // input, debounced 300 ms). Typing the UUID and waiting
    // for the table to refetch isolates this test's event
    // from the rest of the DB.
    const linkIdFilter = page.getByLabel('Link ID');
    await linkIdFilter.fill(created.id);
    // The Input primitive's label-to-input binding uses `htmlFor`,
    // so `getByLabel` works here. Wait for the debounce + fetch.
    await expect(page.getByText('(deleted link)').first()).toBeVisible({ timeout: 10_000 });
  });
});
