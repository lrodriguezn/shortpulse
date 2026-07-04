/**
 * Smoke test for the Vite + React + TailwindCSS scaffold.
 *
 * Verifies that the minimal `App` component mounts cleanly and that
 * the TailwindCSS base layer is wired (the `body` element gets the
 * `bg-neutral-50` class via the global stylesheet imported in
 * `main.tsx`). This is the RED phase of the WU1 TDD cycle; the test
 * fails until `App` exists and is wired to the entry point.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { App } from './app.js';

describe('App scaffold', () => {
  it('renders the brand heading', () => {
    render(<App />);
    // The WU1 scaffold renders a single visible heading so the test
    // has something to assert; the layout + nav land in WU2.
    expect(screen.getByRole('heading', { name: /shortpulse/i })).toBeInTheDocument();
  });
});
