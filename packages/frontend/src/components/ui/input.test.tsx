/**
 * Tests for the `Input` primitive (text + label + error).
 *
 * Every form field in the SPA (the create-link form, the search
 * input on the links table, the analytics date filters) wraps this
 * primitive. The label is bound to the input via `htmlFor`/`id`
 * (accessibility) and the error message has `role="alert"` so
 * screen readers announce it. The primitive accepts the same
 * props as a native `<input>` and forwards them, so callers
 * don't lose `name`, `autoComplete`, `aria-*`, etc.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Input } from './input.js';

describe('Input', () => {
  it('renders a text input with the given label', () => {
    render(<Input label="URL" name="original_url" />);
    const input = screen.getByLabelText(/url/i);
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('shows the error message and styles the field invalid when error is set', () => {
    render(<Input label="URL" name="original_url" error="Must be an http or https URL" />);
    const input = screen.getByLabelText(/url/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // The error is announced via role="alert" so screen readers
    // read it out as soon as the message appears.
    expect(screen.getByRole('alert')).toHaveTextContent(/must be an http or https url/i);
  });

  it('forwards the placeholder and value to the underlying input', () => {
    render(<Input label="Search" name="search" placeholder="Find a link" defaultValue="docs" />);
    const input = screen.getByLabelText(/search/i);
    expect(input).toHaveAttribute('placeholder', 'Find a link');
    expect(input).toHaveValue('docs');
  });

  it('binds the label to the input via the same id', () => {
    render(<Input label="Slug" name="slug" id="slug-input" />);
    const input = screen.getByLabelText(/slug/i);
    expect(input.id).toBe('slug-input');
  });
});
