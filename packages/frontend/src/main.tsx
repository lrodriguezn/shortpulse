/**
 * React + ReactDOM client entry point for the ShortPulse SPA.
 *
 * Responsibilities:
 *  - Mount the React app into the `#root` div from `index.html`.
 *  - Import the global stylesheet so TailwindCSS directives
 *    (`@tailwind base/components/utilities`) are emitted by Vite.
 *  - Compose the production app: TanStack Query (`QueryClient`) +
 *    sonner `<Toaster />` + the TanStack Router `<RouterProvider />`
 *    from `createAppRouter()`. The QueryClient is registered on the
 *    router context so route components can call
 *    `useQuery({ context: { queryClient } })` without an extra hop.
 */
import './styles/globals.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';

import { createAppRouter } from './router.js';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('main: #root element not found in index.html');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // SPEC: short-stale data is fine; analytics dashboards tolerate
      // up to a minute of staleness. Lower in dev for HMR-driven
      // iteration; the spec value is 60s.
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const router = createAppRouter(queryClient);

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>,
);
