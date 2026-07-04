/**
 * E2E: delete-link — the table's delete action + the soft-delete
 * invariants.
 *
 * Spec coverage: `openspec/specs/links/spec.md` requirement #3
 * and scenarios "Soft-delete link", "Delete already-deleted link",
 * "Redirect for deleted slug returns 404"; plus
 * `openspec/specs/analytics/spec.md` requirement #5
 * ("Retention after soft-delete") and the scenario
 * "Deleted link renders as deleted link".
 *
 * The delete flow is the LAST step in the spec-locked user
 * journey: create → redirect → analytics → delete. The tests
 * assert the three spec-locked invariants of a soft-delete:
 *  1. The row disappears from the Links table (the FE's
 *     `useDeleteLink` invalidates the list query on success).
 *  2. The slug stops redirecting (404 from `GET /:slug`).
 *  3. The analytics events for the deleted link are RETAINED —
 *     the link's `link_label` in the events table renders as
 *     `"(deleted link)"` (the spec-locked presentation literal).
 *
 * **Dialog handling.** The `LinksTable`'s delete handler uses
 * `window.confirm()`. Playwright auto-dismisses dialogs (rejects
 * them) by default, which would block the delete from happening.
 * The test registers a one-shot `page.once('dialog', accept)`
 * handler BEFORE clicking the delete button so the confirmation
 * is accepted and the mutation proceeds.
 *
 * **Why the events-table filter by `link_id`.** The events table
 * is paginated and may contain events from other tests. Filtering
 * by the specific `link_id` isolates THIS test's event from the
 * rest of the DB, so the assertion on `"(deleted link)"` is
 * robust regardless of test ordering or shared-DB state.
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
 * Create a link via the public API and return the parsed body.
 * Same helper shape as the redirect spec — kept inline (not
 * shared) to keep each spec file self-contained: a spec file
 * is a reviewable unit and the `import` surface is the spec's
 * contract.
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

test.describe('Delete link', () => {
  test('deleting a link via the table removes it from the list', async ({ page, request }) => {
    // Seed via the API (faster than the UI for setup) so the
    // test focuses on the delete flow itself. The row MUST
    // appear in the table on first paint.
    const slug = uniqueSlug('del');
    const originalUrl = 'https://example.com/delete-me';
    await createLinkViaApi(request, { original_url: originalUrl, slug });

    await page.goto('/');
    const row = page.locator('tr', { has: page.getByText(originalUrl) });
    await expect(row).toBeVisible();

    // Register the dialog handler BEFORE the click. Playwright
    // auto-dismisses dialogs by default; without this handler
    // the `window.confirm` would be rejected and the delete
    // would NOT happen.
    page.once('dialog', (dialog) => {
      void dialog.accept();
    });

    // The delete button is the last action in the row's actions
    // cell. The button's accessible name includes the slug
    // (`aria-label="Eliminar <slug>"`), which makes the
    // selector robust against multiple links in the table.
    await row.getByRole('button', { name: `Eliminar ${slug}` }).click();

    // The row must disappear. TanStack Query invalidates the
    // list cache on mutation success, so the table re-fetches
    // and the soft-deleted link is no longer in `data[]`.
    await expect(row).not.toBeVisible();
  });

  test('after deletion, the slug no longer redirects (returns 404)', async ({ request }) => {
    const slug = uniqueSlug('no-redir');
    const originalUrl = 'https://example.com/no-more-redirects';
    const created = await createLinkViaApi(request, { original_url: originalUrl, slug });

    // Confirm the slug redirects BEFORE the delete — sanity
    // check that the test isn't asserting on a slug that never
    // worked.
    const beforeRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(beforeRes.status()).toBe(302);

    await request.delete(`${BASE_URL}/api/links/${created.id}`);

    // After soft-delete the BE returns 404 problem-details
    // (spec links #4 + scenario "Redirect for deleted slug
    // returns 404"). The use case throws `NotFoundError`
    // because the repository's `findBySlug` filters on
    // `deleted_at IS NULL`.
    const afterRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(afterRes.status()).toBe(404);
  });

  test('analytics for a deleted link are retained and render as "(deleted link)"', async ({
    page,
    request,
  }) => {
    const slug = uniqueSlug('del-anl');
    const originalUrl = 'https://example.com/retain-analytics';
    const created = await createLinkViaApi(request, { original_url: originalUrl, slug });

    // Generate an analytics event so there's something to retain.
    const clickRes = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(clickRes.status()).toBe(302);

    // Soft-delete the link.
    const deleteRes = await request.delete(`${BASE_URL}/api/links/${created.id}`);
    expect(deleteRes.status()).toBe(204);

    // Navigate to the analytics page and filter the events
    // table by the original link_id. The `Input` primitive's
    // label-to-input binding (htmlFor / id) means `getByLabel`
    // resolves the input directly. The filter is debounced
    // 300 ms in the events table, so we wait for the
    // `"(deleted link)"` label to appear after the refetch.
    await page.goto('/analytics');
    await page.getByLabel('Link ID').fill(created.id);
    await expect(page.getByText('(deleted link)').first()).toBeVisible({ timeout: 10_000 });
  });
});
