/**
 * Router instance + route tree.
 *
 * The route tree is wired manually rather than via the file-based
 * Vite plugin. Manual wiring has two benefits for this project:
 *  - **No codegen step** at build/dev time \u2014 `routeTree.gen.ts`
 *    would be a build artifact that drifts from the route files if
 *    the codegen step is skipped; the manual wiring IS the source
 *    of truth.
 *  - **Test isolation** \u2014 individual tests can construct their own
 *    trees (see `not-found.test.tsx`, `layout.test.tsx`) without
 *    depending on the plugin-emitted entry.
 *
 * The 404 is owned by the ROOT route's `notFoundComponent` with
 * `notFoundMode: 'root'`. When no child matches, TanStack Router
 * renders the root's component (which contains the nav + `<Outlet />`)
 * AND the `notFoundComponent` inside that `<Outlet />` \u2014 so the
 * nav stays visible and the user gets the spec-locked 404 page.
 * The two children (`/`, `/analytics`) are the spec-locked
 * destinations from design \u00a77.
 */
import { createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

import { RootLayout } from './routes/__root.js';
import { LinksPage } from './routes/index.js';
import { AnalyticsPage } from './routes/analytics.js';
import { NotFoundPage } from './routes/$.js';

/**
 * Router context \u2014 the QueryClient is registered at createRouter
 * time so route loaders / error boundaries can use TanStack Query
 * without an extra provider hop. Phase 7 ships the seam; Phase 8
 * starts consuming it in the create-link mutation's onError.
 */
export interface RouterAppContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterAppContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LinksPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  component: AnalyticsPage,
});

const routeTree = rootRoute.addChildren([indexRoute, analyticsRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Render the root's `notFoundComponent` INSIDE the root's
    // `<Outlet />` so the nav from `RootLayout` stays visible on
    // unmatched URLs (per design §7's minimalist 404 UX).
    notFoundMode: 'root',
  });
}

/** Type alias for the router instance \u2014 consumed by main.tsx. */
export type AppRouter = ReturnType<typeof createAppRouter>;

// Register the router type so route components get type-safe
// `useNavigate`, `useParams`, `Link`, etc. This declaration must
// appear exactly once at module top level.
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
