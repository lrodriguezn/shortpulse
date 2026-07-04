/**
 * Tests for the `LinksPage` composition.
 *
 * The page is the spec-locked destination for `/`: it composes
 * the `CreateLinkForm` (top) and the `LinksTable` (below) so
 * a user can create a link and immediately see it in the list.
 * We mock the children (form + table) to assert the page wires
 * them together in the right order, and we test the route
 * integration in `routes/index.test.tsx` to assert the router
 * renders the page for "/".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./create-link-form.js', () => ({
  CreateLinkForm: () => <div data-testid="create-link-form-stub">CreateLinkForm stub</div>,
}));

vi.mock('./links-table.js', () => ({
  LinksTable: () => <div data-testid="links-table-stub">LinksTable stub</div>,
}));

import { LinksPage } from './links-page.js';

describe('LinksPage', () => {
  it('renders the form and the table', () => {
    render(<LinksPage />);
    expect(screen.getByTestId('create-link-form-stub')).toBeInTheDocument();
    expect(screen.getByTestId('links-table-stub')).toBeInTheDocument();
  });

  it('renders a page heading for the Links section', () => {
    render(<LinksPage />);
    // The page is the "/links" destination; a heading is the
    // spec-locked affordance for the section.
    expect(screen.getByRole('heading', { name: /^links$/i, level: 1 })).toBeInTheDocument();
  });

  it('renders the form before the table (create first, then list)', () => {
    render(<LinksPage />);
    const form = screen.getByTestId('create-link-form-stub');
    const table = screen.getByTestId('links-table-stub');
    // `form` should appear in the DOM before `table` (FOLLOWING
    // means "this node is FOLLOWED by the argument").
    expect(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
