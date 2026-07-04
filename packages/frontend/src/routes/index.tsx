/**
 * Links page \u2014 `routes/index.tsx`.
 *
 * Phase 7 shipped a placeholder so the route resolved from day one.
 * Phase 8 lands the real implementation: a re-export of
 * `LinksPage` from the Links feature folder. The router
 * (`router.ts`) imports `LinksPage` from this file; re-exporting
 * keeps the import path stable while moving the actual code to
 * `features/links/links-page.tsx` where the rest of the Links
 * feature (form, table, hooks) lives.
 */
export { LinksPage } from '../features/links/links-page.js';
