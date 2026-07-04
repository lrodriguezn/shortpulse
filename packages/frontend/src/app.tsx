/**
 * Root `App` component for the ShortPulse SPA.
 *
 * WU1 (scaffold) renders a single visible heading so the entry point
 * has a verifiable DOM. WU2 replaces this body with a TanStack Router
 * `RouterProvider`; WU2 is responsible for the layout shell, the nav
 * bar, and the 404 catch-all. The 404 spec text
 * ("El enlace solicitado no existe." / "Volver al inicio") is owned by
 * the WU2 not-found route component, NOT this file.
 */
export function App(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold text-neutral-900">ShortPulse</h1>
      <p className="mt-2 text-neutral-600">URL shortener — scaffold up. Routes arrive in WU2.</p>
    </main>
  );
}
