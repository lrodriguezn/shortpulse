/**
 * React + ReactDOM client entry point for the ShortPulse SPA.
 *
 * Responsibilities (WU1 scaffold):
 *  - Mount the React app into the `#root` div from `index.html`.
 *  - Import the global stylesheet so TailwindCSS directives
 *    (`@tailwind base/components/utilities`) are emitted by Vite.
 *  - Render the WU1 placeholder `App`. WU2 swaps this for
 *    a `<RouterProvider router={router} />`.
 */
import './styles/globals.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app.js';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('main: #root element not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
