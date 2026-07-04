/**
 * Tests for the `EmptyState` primitive.
 *
 * The empty state shows up on the Links page when the user has
 * no links yet ("No links yet" + CTA) and on the Analytics page
 * when there's no data in the selected range. The component is
 * intentionally pure presentation: it composes an icon, a
 * title, a description, and an optional action slot. The
 * spec-locked label is "No hay enlaces a\u00fan" in the Links
 * context (orchestrator-derived; matches the design's minimalist
 * neutral palette).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EmptyState } from './empty-state.js';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState title={'No hay enlaces aún'} description={'Crea tu primer enlace.'} />);
    expect(screen.getByRole('heading', { name: /no hay enlaces aún/i })).toBeInTheDocument();
    expect(screen.getByText(/crea tu primer enlace\./i)).toBeInTheDocument();
  });

  it('renders an action slot when provided', () => {
    render(
      <EmptyState
        title="No data"
        description="Try a different date range."
        action={<button type="button">Reset filters</button>}
      />,
    );
    expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
  });

  it('renders with only the title (no description, no action)', () => {
    // The null branches for `description` and `action` must render
    // without crashing (the spec only requires the title).
    render(<EmptyState title={'Sin descripción'} />);

    expect(screen.getByRole('heading', { name: /sin descripción/i })).toBeInTheDocument();
    // The description <p> and the action <div> wrappers are NOT
    // rendered when the props are absent — the container still has
    // the title section.
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });
});
