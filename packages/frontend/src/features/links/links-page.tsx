/**
 * `LinksPage` \u2014 the "/" destination of the SPA.
 *
 * Spec contract: the page composes the `CreateLinkForm` (top)
 * and the `LinksTable` (below) so a user can create a link and
 * immediately see it in the list. The page itself is a thin
 * presentational wrapper \u2014 no state, no side effects. Each
 * child component owns its own state and side effects (RHF
 * for the form, TanStack Query for the table).
 *
 * The page is exported from `routes/index.tsx` so the router
 * tree (`router.ts`) can import it through the same path that
 * every other route uses. Keeping the route file as a
 * one-liner re-export keeps the feature folder as the single
 * source of truth for the component.
 */
import { CreateLinkForm } from './create-link-form.js';
import { LinksTable } from './links-table.js';

export function LinksPage(): React.JSX.Element {
  return (
    <section aria-labelledby="links-title" className="flex flex-col gap-6">
      <h1 id="links-title" className="text-2xl font-semibold text-sp-fg">
        Links
      </h1>
      <CreateLinkForm />
      <LinksTable />
    </section>
  );
}
