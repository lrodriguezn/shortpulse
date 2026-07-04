/**
 * Tests for the `ErrorBoundary` primitive.
 *
 * React error boundaries catch render-phase exceptions and show a
 * fallback UI. The ShortPulse boundary uses the spec-locked
 * Spanish copy ("Algo sali\u00f3 mal") and exposes a retry
 * affordance (reloads the current route by reloading the page).
 * The boundary is used at the root layout level so a render
 * error in any child route degrades gracefully.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErrorBoundary } from './error-boundary.js';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText(/all good/i)).toBeInTheDocument();
  });

  it('renders the fallback UI when a child throws', () => {
    // Suppress the React error-log noise from the test output
    // \u2014 the boundary is doing its job; we don't need a stack
    // trace in CI logs.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/algo salió mal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();

    spy.mockRestore();
  });

  it('reloads the page when the retry button is clicked', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    // jsdom exposes location.reload; override it for the test.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(reload).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
