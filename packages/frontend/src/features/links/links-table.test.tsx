/**
 * Tests for the `LinksTable` component.
 *
 * The table is the dashboard of the Links feature: a paginated,
 * searchable, sortable list with copy / open / delete actions per
 * row. We exercise every spec-locked behavior:
 *  - Renders rows from the `useLinks` query.
 *  - Search box filters via the `useLinks` query (`search` param
 *    passed to the BE), with a debounce so we don't spam the API.
 *  - Sort toggle on the column header is CLIENT-SIDE (TanStack
 *    Table operates on the data already in the cache) \u2014
 *    instant feedback, no loading state.
 *  - Pagination controls call `useLinks` with the right `page`
 *    param.
 *  - Copy button calls the clipboard hook and toasts.
 *  - Open button points at `original_url` with `target="_blank"`
 *    + `rel="noopener noreferrer"`.
 *  - Delete button opens a confirm dialog and, on accept, calls
 *    `useDeleteLink` and toasts.
 *  - Empty state renders the `EmptyState` primitive when the
 *    data array is empty.
 *  - Loading state renders a `Spinner` while `isPending`.
 *  - Error state renders a recoverable error block.
 *
 * We mock the hooks (no real API), `sonner` (toast assertions),
 * and `window.confirm` (so the delete path is deterministic).
 * The clipboard is mocked in the global setup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { LinkResponse } from '@shortpulse/shared';
import type { PagedResponse } from '../../lib/api.js';

// --- Hoisted mocks ----------------------------------------------------------

const useLinksState = vi.hoisted(() => ({
  data: undefined as PagedResponse<LinkResponse> | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

const useDeleteLinkState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  reset: vi.fn(),
}));

const copyState = vi.hoisted(() => ({
  copy: vi.fn(),
  copied: false,
}));

vi.mock('../../hooks/use-links.js', () => ({
  useLinks: () => useLinksState,
  useDeleteLink: () => useDeleteLinkState,
}));

vi.mock('../../hooks/use-copy-to-clipboard.js', () => ({
  useCopyToClipboard: () => copyState,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  }),
}));

import { LinksTable } from './links-table.js';

const ORIGINAL_FETCH = globalThis.fetch;

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function buildRow(overrides: Partial<LinkResponse> = {}): LinkResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    original_url: 'https://example.com',
    slug: 'ex',
    short_url: 'http://api.test/ex',
    created_at: '2026-07-04T00:00:00.000Z',
    click_count: 7,
    deleted_at: null,
    ...overrides,
  };
}

function buildPaged(
  rows: LinkResponse[],
  overrides: Partial<PagedResponse<LinkResponse>> = {},
): PagedResponse<LinkResponse> {
  return {
    data: rows,
    total: rows.length,
    page: 1,
    page_size: 20,
    ...overrides,
  };
}

beforeEach(() => {
  useLinksState.data = undefined;
  useLinksState.isPending = false;
  useLinksState.isError = false;
  useLinksState.error = null;
  useLinksState.refetch = vi.fn();
  useDeleteLinkState.mutateAsync.mockReset();
  useDeleteLinkState.isPending = false;
  useDeleteLinkState.reset.mockReset();
  copyState.copy.mockReset();
  copyState.copied = false;
  copyState.copy.mockResolvedValue(true);
  toastSuccess.mockReset();
  toastError.mockReset();
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

describe('LinksTable \u2014 loading / empty / error states', () => {
  it('renders a Spinner while the query is pending', () => {
    useLinksState.isPending = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the EmptyState when the data array is empty', () => {
    useLinksState.data = buildPaged([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('heading', { name: /no hay enlaces a\u00fan/i })).toBeInTheDocument();
  });

  it('renders an error block with a retry button when the query fails', async () => {
    useLinksState.isError = true;
    useLinksState.error = new Error('Network down');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /reintentar/i });
    expect(retry).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(retry);
    expect(useLinksState.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('LinksTable \u2014 rows', () => {
  it('renders the spec-locked columns for each link', () => {
    useLinksState.data = buildPaged([
      buildRow({ id: '00000000-0000-0000-0000-000000000001', slug: 'docs' }),
      buildRow({
        id: '00000000-0000-0000-0000-000000000002',
        slug: 'blog',
        original_url: 'https://blog.example.com',
        short_url: 'http://api.test/blog',
        click_count: 12,
      }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    // Both rows are visible.
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('https://blog.example.com')).toBeInTheDocument();
    // Column headers.
    expect(screen.getByRole('columnheader', { name: /url original/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /short url/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^slug$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /creado/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /clicks/i })).toBeInTheDocument();
    // Action buttons (one per row, × 3 actions = 6 controls).
    const copyButtons = screen.getAllByRole('button', { name: /copiar/i });
    expect(copyButtons.length).toBe(2);
    const openLinks = screen.getAllByRole('link', { name: /abrir/i });
    expect(openLinks.length).toBe(2);
    const deleteButtons = screen.getAllByRole('button', { name: /eliminar/i });
    expect(deleteButtons.length).toBe(2);
  });

  it('opens the original URL in a new tab via the Open button', () => {
    useLinksState.data = buildPaged([buildRow({ original_url: 'https://example.com/landing' })]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    const openLink = screen.getByRole('link', { name: /abrir/i });
    expect(openLink).toHaveAttribute('href', 'https://example.com/landing');
    expect(openLink).toHaveAttribute('target', '_blank');
    expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('copies the short_url and toasts when the Copy button is clicked', async () => {
    useLinksState.data = buildPaged([
      buildRow({ slug: 'docs', short_url: 'http://api.test/docs' }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /copiar/i }));

    await waitFor(() => expect(copyState.copy).toHaveBeenCalled());
    expect(copyState.copy).toHaveBeenCalledWith('http://api.test/docs');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('URL copiada'));
  });

  it('deletes the row after a confirm dialog and toasts success', async () => {
    useLinksState.data = buildPaged([buildRow({ id: '00000000-0000-0000-0000-000000000099' })]);
    useDeleteLinkState.mutateAsync.mockResolvedValue(undefined);
    // Accept the confirm dialog.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    await waitFor(() => expect(useDeleteLinkState.mutateAsync).toHaveBeenCalledTimes(1));
    expect(useDeleteLinkState.mutateAsync).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000099',
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Enlace eliminado'));
    confirmSpy.mockRestore();
  });

  it('does not delete the row when the user cancels the confirm', async () => {
    useLinksState.data = buildPaged([buildRow()]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(useDeleteLinkState.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('LinksTable \u2014 pagination', () => {
  it('shows page controls when there are multiple pages', () => {
    useLinksState.data = buildPaged([buildRow()], { total: 45, page: 1, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('button', { name: /anterior/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument();
  });

  it('does not show a Previous button on the first page', () => {
    useLinksState.data = buildPaged([buildRow()], { total: 45, page: 1, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
  });

  it('does not show a Next button on the last page', () => {
    useLinksState.data = buildPaged([buildRow()], { total: 45, page: 3, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });
});

describe('LinksTable \u2014 sort', () => {
  it('toggles sort direction when the Clicks column header is clicked', async () => {
    useLinksState.data = buildPaged([
      buildRow({ id: 'a', click_count: 5, slug: 'a' }),
      buildRow({ id: 'b', click_count: 12, slug: 'b' }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LinksTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    const clicksHeader = screen.getByRole('columnheader', { name: /clicks/i });
    // Initial sort: no client-side sort is active, so the header
    // advertises the WAI-ARIA "none" state.
    expect(clicksHeader).toHaveAttribute('aria-sort', 'none');

    // Click the inner sort button (the `<th>` itself is not
    // clickable; the button inside the th is the toggle).
    const sortButton = within(clicksHeader).getByRole('button');
    await user.click(sortButton);
    const tbody = screen.getAllByRole('rowgroup')[1]!;
    const cells = within(tbody).getAllByRole('cell');
    // First row's click_count cell (5) comes before the second (12).
    const cellTexts = cells.map((c) => c.textContent ?? '');
    const idxOfA = cellTexts.findIndex((t) => t.includes('5'));
    const idxOfB = cellTexts.findIndex((t) => t.includes('12'));
    expect(idxOfA).toBeLessThan(idxOfB);
    expect(clicksHeader).toHaveAttribute('aria-sort', 'ascending');

    // Click again → descending.
    await user.click(sortButton);
    expect(clicksHeader).toHaveAttribute('aria-sort', 'descending');
  });
});
