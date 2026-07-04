/**
 * Tests for the 404 catch-all route.
 *
 * The 404 spec text is locked by the orchestrator's slice prompt
 * (derived from design.md \u00a77 and the proposal's "Frontend (3 pages)"
 * requirement): the user-facing copy MUST be "El enlace solicitado no
 * existe." and the back-to-home control MUST read "Volver al inicio"
 * and point to "/". The 404 is owned by the ROOT route's
 * `notFoundComponent` and renders INSIDE the root's `<Outlet />`
 * (so the nav stays visible). Each test constructs a fresh router
 * to keep the match state isolated.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Outlet } from '@tanstack/react-router';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { NotFoundPage } from './$.js';

afterEach(() => {
  cleanup();
});

function buildNotFoundRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <div>
        <nav>nav</nav>
        <Outlet />
      </div>
    ),
    notFoundComponent: NotFoundPage,
  });

  createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>home placeholder</div>,
  });

  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/no-such-page'] }),
    notFoundMode: 'root',
  });
}

async function waitForRouter(router: ReturnType<typeof buildNotFoundRouter>) {
  // TanStack Router renders asynchronously (the Matches component
  // subscribes to the router's match store). We need the first match
  // to be committed before the test asserts DOM contents. `router.load()`
  // is the documented seam; combined with a microtask flush it gives
  // `render()` a settled tree to assert against.
  await router.load();
}

describe('NotFoundPage (404 catch-all)', () => {
  it('renders the 404 status', async () => {
    const router = buildNotFoundRouter();
    await waitForRouter(router);
    render(<RouterProvider router={router} />);
    // The exact "404" marker is the spec-locked page-level signal.
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('shows the spec-locked Spanish detail message', async () => {
    const router = buildNotFoundRouter();
    await waitForRouter(router);
    render(<RouterProvider router={router} />);
    expect(screen.getByText('El enlace solicitado no existe.')).toBeInTheDocument();
  });

  it('exposes a "Volver al inicio" link that points to the home route', async () => {
    const router = buildNotFoundRouter();
    await waitForRouter(router);
    render(<RouterProvider router={router} />);
    const home = screen.getByRole('link', { name: /volver al inicio/i });
    expect(home).toBeInTheDocument();
    expect(home.getAttribute('href')).toBe('/');
  });
});
