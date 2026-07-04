/**
 * Tests for the `Spinner` primitive.
 *
 * The spinner is the loading affordance used while TanStack Query
 * is fetching (table load, KPI cards, redirect-after-create, etc.).
 * It renders a `role="status"` element with an `aria-label` so
 * assistive tech announces the busy state without dumping the
 * decorative SVG into the accessibility tree.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Spinner } from './spinner.js';

describe('Spinner', () => {
  it('renders a status element with a default label', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label');
  });

  it('respects a custom label', () => {
    render(<Spinner label="Loading links" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading links');
  });
});
