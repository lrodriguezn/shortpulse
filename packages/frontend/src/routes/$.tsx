/**
 * 404 catch-all route \u2014 `routes/$.tsx`.
 *
 * Renders when TanStack Router's matcher doesn't find a more specific
 * route for the requested URL. The page is intentionally minimal:
 * the spec-locked "404" + Spanish message + a back-to-home control.
 *
 * Why a "Minimalist" page (per spec links `not_found` UX, design
 * \u00a77): a URL the user typed wrong (or followed from a stale link)
 * shouldn't dump them into a marketing layout. They need an
 * unambiguous signal that the destination is wrong AND a one-click
 * way to recover.
 *
 * Spec text (orchestrator-locked, slice 8):
 *  - "404"   \u2014 the status marker
 *  - "El enlace solicitado no existe." \u2014 the Spanish detail
 *  - "Volver al inicio"  \u2014 the recovery control, links to "/"
 */
import { Link } from '@tanstack/react-router';

export function NotFoundPage(): React.JSX.Element {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-24 text-center"
    >
      <p className="text-6xl font-semibold tracking-tight text-neutral-900" aria-hidden="true">
        404
      </p>
      <h1 id="not-found-title" className="sr-only">
        P\u00e1gina no encontrada
      </h1>
      <p className="text-lg text-neutral-700">El enlace solicitado no existe.</p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
