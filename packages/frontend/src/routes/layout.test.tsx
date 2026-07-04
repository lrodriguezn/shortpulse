/**
 * Tests for the top-level layout + nav.
 *
 * The layout owns the SPA nav bar: two links (Links \u2192 /, Analytics
 * \u2192 /analytics) and an `<Outlet />` for the active route. The
 * minimal Links / Analytics placeholders that live in
 * `routes/index.tsx` and `routes/analytics.tsx` (Phase 7 WU2 \u2014
 * the full feature lands in Phase 8 / 9) are wired so the smoke
 * test can assert the Outlet renders child content. Each test
 * constructs a fresh router to keep match state isolated.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { RootLayout } from './__root.js';

// `globals: false` in our vitest config disables @testing-library's
// auto-cleanup, so we wire `afterEach(cleanup)` manually to keep
// tests isolated (otherwise React 18 + React's transition commit
// phase leaves stale DOM behind, which makes
// `getByText` see duplicate content from the previous test).
afterEach(() => {
  cleanup();
});

function buildLayoutRouter(initialPath: '/' | '/analytics') {
  const rootRoute = createRootRoute({ component: RootLayout });

  const linksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Links page placeholder</div>,
  });

  const analyticsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/analytics',
    component: () => <div>Analytics page placeholder</div>,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([linksRoute, analyticsRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

async function waitForRouter(router: ReturnType<typeof buildLayoutRouter>) {
  // Same rationale as the not-found tests: TanStack Router renders
  // asynchronously and we need the first match committed before
  // the DOM assertions.
  await router.load();
}

describe('RootLayout', () => {
  it('renders a nav bar with the brand and the two spec routes', async () => {
    const router = buildLayoutRouter('/');
    await waitForRouter(router);
    render(<RouterProvider router={router} />);
    // Brand link in the header.
    expect(screen.getByRole('link', { name: /shortpulse/i })).toBeInTheDocument();
    // The nav contains the two spec-locked destinations.
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /links/i })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: /analytics/i })).toHaveAttribute(
      'href',
      '/analytics',
    );
  });

  it('renders the active child route through the Outlet', async () => {
    const router = buildLayoutRouter('/');
    await waitForRouter(router);
    render(<RouterProvider router={router} />);
    // The Links placeholder route is at "/" and renders the test marker.
    expect(screen.getByText('Links page placeholder')).toBeInTheDocument();
  });
});
