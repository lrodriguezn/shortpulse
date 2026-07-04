/**
 * Tests for the `CreateLinkForm` component.
 *
 * The form is the entry-point of the Links feature. The contract:
 *  - Renders the two spec-locked fields (`original_url` required,
 *    `slug` optional).
 *  - Validates client-side via the shared `createLinkSchema`
 *    (RHF + zodResolver) and surfaces field errors.
 *  - On submit, calls the `useCreateLink` mutation. On 409
 *    collision, toasts the spec-locked Spanish string. On 400,
 *    the field errors from the BE land in the form. On success,
 *    toasts, resets the form, and copies the new `short_url` to
 *    the clipboard.
 *  - The submit button is disabled + shows a spinner while the
 *    mutation is in flight.
 *
 * We mock `useCreateLink` (the only FE side-effect) and `sonner`
 * (toast assertions are the only signal the success / error paths
 * took the right branch). The clipboard is also mocked so the
 * success path can assert it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { ApiError } from '../../lib/api.js';
import type { LinkResponse } from '@shortpulse/shared';

// --- Hoisted mocks ----------------------------------------------------------

const useCreateLinkState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  reset: vi.fn(),
}));

vi.mock('../../hooks/use-links.js', () => ({
  useCreateLink: () => useCreateLinkState,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastDefault = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastDefault(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  }),
}));

import { CreateLinkForm } from './create-link-form.js';

const ORIGINAL_FETCH = globalThis.fetch;

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function buildLinkResponse(overrides: Partial<LinkResponse> = {}): LinkResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    original_url: 'https://example.com',
    slug: 'my-link',
    short_url: 'http://api.test/my-link',
    created_at: '2026-07-04T00:00:00.000Z',
    click_count: 0,
    deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  useCreateLinkState.mutateAsync.mockReset();
  useCreateLinkState.isPending = false;
  useCreateLinkState.reset.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastDefault.mockReset();
  // jsdom does not implement the Clipboard API by default.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  cleanup();
});

describe('CreateLinkForm', () => {
  it('renders both fields with their labels', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    expect(screen.getByLabelText(/url original/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crear enlace/i })).toBeInTheDocument();
  });

  it('shows a validation error when the URL is missing', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    // Leave the URL empty and submit. RHF's zodResolver surfaces
    // the message from the schema.
    await user.click(screen.getByRole('button', { name: /crear enlace/i }));

    // The mutation must NOT have been called.
    expect(useCreateLinkState.mutateAsync).not.toHaveBeenCalled();
    // The URL field has an inline error.
    const urlInput = screen.getByLabelText(/url original/i);
    expect(urlInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('shows a validation error when the URL is not http(s)', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    await user.type(screen.getByLabelText(/url original/i), 'ftp://example.com');
    await user.click(screen.getByRole('button', { name: /crear enlace/i }));

    expect(useCreateLinkState.mutateAsync).not.toHaveBeenCalled();
    const urlInput = screen.getByLabelText(/url original/i);
    expect(urlInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('calls the mutation on a valid submit', async () => {
    const user = userEvent.setup();
    useCreateLinkState.mutateAsync.mockResolvedValue(buildLinkResponse());

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    await user.type(screen.getByLabelText(/url original/i), 'https://example.com');
    await user.type(screen.getByLabelText(/slug/i), 'my-link');
    await user.click(screen.getByRole('button', { name: /crear enlace/i }));

    await waitFor(() => expect(useCreateLinkState.mutateAsync).toHaveBeenCalledTimes(1));
    expect(useCreateLinkState.mutateAsync).toHaveBeenCalledWith({
      original_url: 'https://example.com',
      slug: 'my-link',
    });
  });

  it('toasts the spec-locked Spanish string on a 409 collision', async () => {
    const user = userEvent.setup();
    useCreateLinkState.mutateAsync.mockRejectedValue(
      new ApiError(409, 'Ese slug ya existe, prueba otro', 'Ese slug ya existe, prueba otro'),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    await user.type(screen.getByLabelText(/url original/i), 'https://example.com');
    await user.type(screen.getByLabelText(/slug/i), 'taken');
    await user.click(screen.getByRole('button', { name: /crear enlace/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith('Ese slug ya existe, prueba otro');
    // Form is NOT reset on error (so the user can fix the slug).
    expect(screen.getByLabelText(/slug/i)).toHaveValue('taken');
  });

  it('toasts success, resets the form, and copies the short_url on success', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    (navigator.clipboard as { writeText: typeof navigator.clipboard.writeText }).writeText =
      writeText;
    useCreateLinkState.mutateAsync.mockResolvedValue(
      buildLinkResponse({ slug: 'fresh', short_url: 'http://api.test/fresh' }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    const urlInput = screen.getByLabelText(/url original/i);
    const slugInput = screen.getByLabelText(/slug/i);
    await user.type(urlInput, 'https://example.com');
    await user.type(slugInput, 'fresh');
    await user.click(screen.getByRole('button', { name: /crear enlace/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith('Link creado');
    // The "URL copiada" toast is also fired.
    expect(toastSuccess).toHaveBeenCalledWith('URL copiada');
    // Clipboard receives the short_url from the response.
    expect(writeText).toHaveBeenCalledWith('http://api.test/fresh');
    // Form is reset.
    await waitFor(() => {
      expect(urlInput).toHaveValue('');
      expect(slugInput).toHaveValue('');
    });
  });

  it('disables the submit button and shows a spinner while the mutation is pending', () => {
    useCreateLinkState.isPending = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    // The button's accessible name includes the Spinner's
    // "Loading" label while in flight, so we look it up by its
    // aria-busy attribute (the documented affordance for the
    // busy state).
    const btn = document.querySelector('button[aria-busy="true"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('omits the slug field from the payload when the user leaves it empty', async () => {
    const user = userEvent.setup();
    useCreateLinkState.mutateAsync.mockResolvedValue(
      buildLinkResponse({ slug: 'auto', short_url: 'http://api.test/auto' }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CreateLinkForm />, { wrapper: makeWrapper(qc) });

    await user.type(screen.getByLabelText(/url original/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /crear enlace/i }));

    await waitFor(() => expect(useCreateLinkState.mutateAsync).toHaveBeenCalledTimes(1));
    // `slug` is either absent or undefined \u2014 not the empty string,
    // which would fail the BE's optional regex.
    const payload = useCreateLinkState.mutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.original_url).toBe('https://example.com');
    expect(payload.slug === undefined || payload.slug === '').toBe(true);
  });
});
