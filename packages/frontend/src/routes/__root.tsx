/**
 * Root layout \u2014 `routes/__root.tsx`.
 *
 * Owns the SPA-wide chrome:
 *  - The nav bar with the brand + the two spec-locked destinations
 *    (Links \u2192 "/", Analytics \u2192 "/analytics").
 *  - The TanStack Router `<Outlet />` for the active child route.
 *
 * Phase 7 ships the structure only; the full Links page (form +
 * table) and the full Analytics page (KPIs + Recharts) land in
 * Phases 8 and 9 respectively. The current placeholders render
 * a single heading so the route is navigable from day one.
 */
import { Link, Outlet } from '@tanstack/react-router';

export function RootLayout(): React.JSX.Element {
  return (
    <div className="min-h-full">
      <header className="border-b border-neutral-200 bg-white">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"
        >
          <Link to="/" className="text-lg font-semibold text-neutral-900 hover:text-neutral-700">
            ShortPulse
          </Link>
          <ul className="flex items-center gap-6 text-sm font-medium text-neutral-700">
            <li>
              <Link
                to="/"
                activeProps={{ className: 'text-neutral-900 underline' }}
                className="hover:text-neutral-900"
              >
                Links
              </Link>
            </li>
            <li>
              <Link
                to="/analytics"
                activeProps={{ className: 'text-neutral-900 underline' }}
                className="hover:text-neutral-900"
              >
                Analytics
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
