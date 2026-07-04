/**
 * Links page \u2014 `routes/index.tsx`.
 *
 * Phase 7 placeholder: a heading that confirms the route resolved.
 * The full Links feature (create-link form, TanStack Table with
 * search/sort/pagination, copy/open/delete actions) lands in
 * Phase 8 (slice 9). The route MUST exist now so the nav link
 * resolves and so the layout's `<Outlet />` has something to
 * render in Phase 7.
 */
export function LinksPage(): React.JSX.Element {
  return (
    <section aria-labelledby="links-title">
      <h1 id="links-title" className="text-2xl font-semibold text-neutral-900">
        Links
      </h1>
      <p className="mt-2 text-neutral-600">
        Acorta tus enlaces y consulta el historial. La tabla y el formulario llegan en la próxima
        fase.
      </p>
    </section>
  );
}
