/**
 * Tests for the `Button` primitive.
 *
 * The button is the workhorse of the UI: forms (Create Link, Delete
 * confirmation), tables (Copy/Open row actions), and the 404 recovery
 * control all consume it. Variants and sizes are presentational
 * affordances only \u2014 they map to Tailwind utility classes so the
 * design system stays consistent. The `loading` state replaces the
 * label with a Spinner and announces the busy state to assistive
 * tech via `aria-busy`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button.js';

describe('Button', () => {
  it('renders its children as the visible label', () => {
    render(<Button>Create link</Button>);
    expect(screen.getByRole('button', { name: /create link/i })).toBeInTheDocument();
  });

  it('invokes onClick when activated', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    await userEvent.click(screen.getByRole('button', { name: /tap/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('announces the loading state to assistive tech', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: /save/i });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
  });

  it('exposes a type="button" default so it does not submit forms by accident', () => {
    render(<Button>Just a button</Button>);
    expect(screen.getByRole('button', { name: /just a button/i })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('passes through an explicit type when provided', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button', { name: /submit/i })).toHaveAttribute('type', 'submit');
  });
});
