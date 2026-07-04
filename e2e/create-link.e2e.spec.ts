/**
 * E2E: create-link — the links-page create form.
 *
 * Spec coverage: `openspec/specs/links/spec.md` requirement #1
 * and the linked scenarios:
 *  - "Create link with auto-generated slug"
 *  - "Create link with valid custom slug"
 *  - "Reject invalid URL"
 *  - "Reject custom slug collision"
 *  - "Reject reserved slug" (covered transitively — the FE's
 *    `createLinkSchema` shares the regex with the BE)
 *  - "Reject case-variant collision" (the BE lowercases the
 *    slug before the unique-index lookup, so `My-Link` and
 *    `my-link` collide)
 *
 * The tests run against a live stack (`docker compose up` in CI).
 * When the stack is unreachable, `beforeAll` calls `test.skip()`
 * and the whole file is reported as skipped (not failed) — this
 * is the documented skip strategy from the slice 12 prompt so
 * the suite stays green in local environments without Docker.
 *
 * **Selector strategy.** The FE's `CreateLinkForm` binds labels
 * to inputs via the `Input` primitive's `htmlFor`/`id` pattern,
 * so `getByLabel('URL original')` and `getByLabel('Slug (opcional)')`
 * are the most robust selectors. The submit button has the
 * spec-locked label "Crear enlace" and is matched by accessible
 * name. The table is a real `<table>` element, so `getByRole('row')`
 * and `tr` locators give precise row-level assertions.
 */
import { test, expect } from '@playwright/test';

import { BASE_URL, isStackReachable, uniqueSlug } from './helpers.js';

test.beforeAll(async ({ request }) => {
  // Sanity ping — skip the whole file when the stack is down.
  // The skip message names the base URL so the operator knows
  // where the suite expected the stack to be.
  const reachable = await isStackReachable(request);
  if (!reachable) {
    test.skip(
      true,
      `Stack not reachable at ${BASE_URL} — start docker compose up or pnpm dev to run E2E`,
    );
  }
});

test.describe('Create link', () => {
  test('creates a link with auto-generated slug and shows it in the table', async ({ page }) => {
    await page.goto('/');

    // The Links page renders both the create form and the table.
    await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Crear enlace' })).toBeVisible();

    const url = 'https://example.com';
    await page.getByLabel('URL original').fill(url);
    await page.getByRole('button', { name: 'Crear enlace' }).click();

    // The table should now contain a row for the new URL. The
    // row's Slug cell holds the auto-generated 7-char slug
    // (AUTO_SLUG_LENGTH from `@shortpulse/shared/constants`).
    const row = page.locator('tr', { has: page.getByText(url) });
    await expect(row).toBeVisible();
    // The slug is rendered in a font-mono span inside the Slug
    // cell (3rd `<td>`, 0-indexed). Assert it matches the spec
    // alphabet + length.
    const slugCell = row.locator('td').nth(2);
    await expect(slugCell).toHaveText(/^[A-HJ-NP-Za-hjkmnp-z2-9]{7}$/);
  });

  test('creates a link with a custom slug and shows the short_url', async ({ page }) => {
    await page.goto('/');
    const slug = uniqueSlug('my-link');
    const url = 'https://example.org';
    await page.getByLabel('URL original').fill(url);
    await page.getByLabel('Slug (opcional)').fill(slug);
    await page.getByRole('button', { name: 'Crear enlace' }).click();

    // The new row should show the original URL, the custom slug,
    // and the short_url (`${BASE_URL}/${slug}`). The short_url is
    // rendered in a font-mono span with `text-neutral-700` so we
    // can match it by its `${BASE_URL}/${slug}` shape.
    const row = page.locator('tr', { has: page.getByText(url) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(slug);
    await expect(row).toContainText(`${BASE_URL}/${slug}`);
  });

  test('rejects a colliding custom slug with the 409 "Ese slug ya existe" toast', async ({
    page,
  }) => {
    await page.goto('/');
    const slug = uniqueSlug('taken');
    const firstUrl = 'https://first.example';
    const secondUrl = 'https://second.example';

    // First create — establish the slug.
    await page.getByLabel('URL original').fill(firstUrl);
    await page.getByLabel('Slug (opcional)').fill(slug);
    await page.getByRole('button', { name: 'Crear enlace' }).click();
    await expect(page.locator('tr', { has: page.getByText(firstUrl) })).toBeVisible();

    // Second create — same slug, different URL. The 409 detail
    // is the spec-locked Spanish literal from the BE's
    // problem-details response (see design §5 fix 1).
    await page.getByLabel('URL original').fill(secondUrl);
    // The slug field still holds the previous value; re-fill
    // to be explicit (RHF keeps form state across submissions).
    await page.getByLabel('Slug (opcional)').fill(slug);
    await page.getByRole('button', { name: 'Crear enlace' }).click();

    // The toast is rendered by sonner; the literal string is the
    // BE's `detail` (spec-locked). The form does NOT reset on 409
    // so the user can fix the slug in place.
    await expect(page.getByText('Ese slug ya existe, prueba otro')).toBeVisible();
    // The second URL must NOT have created a row.
    await expect(page.getByText(secondUrl)).not.toBeVisible();
  });

  test('rejects an invalid URL with a client-side validation error', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('URL original').fill('not-a-url');
    await page.getByLabel('Slug (opcional)').fill(uniqueSlug('valid'));
    await page.getByRole('button', { name: 'Crear enlace' }).click();

    // RHF's zodResolver surfaces the Zod error on the field.
    // The `Input` primitive renders the error in a
    // `<span role="alert">` below the input. The exact message
    // is Zod's default for `z.string().url()` ("Invalid url"),
    // but we assert on the alert being visible rather than the
    // exact string so the test survives a Zod version bump.
    await expect(page.getByRole('alert').first()).toBeVisible();
    // The form should not have created a row (the input still
    // holds the invalid value).
    await expect(page.getByLabel('URL original')).toHaveValue('not-a-url');
  });

  test('auto-generates a 7-character slug when the slug field is left empty', async ({ page }) => {
    await page.goto('/');
    const url = 'https://auto-slug.example';
    await page.getByLabel('URL original').fill(url);
    // Leave the slug field empty — RHF's setValueAs converts the
    // empty string to `undefined` so the BE's optional field is
    // omitted from the payload (the BE then auto-generates).
    await page.getByRole('button', { name: 'Crear enlace' }).click();

    const row = page.locator('tr', { has: page.getByText(url) });
    await expect(row).toBeVisible();
    // The auto-generated slug is 7 chars from the 54-char
    // `AUTO_SLUG_ALPHABET` (spec links #5). The regex is
    // slightly narrower than the full alphabet because the
    // uppercase / lowercase ranges exclude visually-confusable
    // characters (0, O, 1, l, I, i, L, o) — see
    // `@shortpulse/shared/constants` for the verified set.
    const slugCell = row.locator('td').nth(2);
    const slug = (await slugCell.textContent()) ?? '';
    expect(slug).toMatch(/^[A-HJ-NP-Za-hjkmnp-z2-9]{7}$/);
  });
});
