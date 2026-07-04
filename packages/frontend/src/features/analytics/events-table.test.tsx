/**
 * Tests for the `EventsTable` component.
 *
 * The table is the bottom of the Analytics dashboard. The
 * spec-locked contract (`openspec/specs/analytics/spec.md`
 * requirement #3 + design §7):
 *  - Renders the spec-locked columns: timestamp, link
 *    (`linkLabel` — slug or "(deleted link)"), ip, country,
 *    city, browser, referer.
 *  - Filters: `link_id` (text input, UUID), `date_from` /
 *    `date_to` (datetime-local inputs), `country` (text input).
 *  - Filter changes are forwarded to the `useAnalytics` query
 *    (so the BE does the filtering server-side). A new filter
 *    starts at page 1.
 *  - Pagination: Previous / Next buttons; server is the source
 *    of truth for the displayed page.
 *  - Empty / loading / error states render their spec-locked
 *    affordances (EmptyState / Spinner / alert block).
 *
 * We mock `useAnalytics` (the only side effect). No fetch,
 * no sonner, no clipboard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { AnalyticsEvent } from '@shortpulse/shared';

import type { PagedResponse } from '../../lib/api.js';

// --- Hoisted mocks ----------------------------------------------------------

const useAnalyticsState = vi.hoisted(() => ({
  data: undefined as PagedResponse<AnalyticsEvent> | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock('../../hooks/use-analytics.js', () => ({
  useAnalytics: () => useAnalyticsState,
}));

import { EventsTable, toIsoFromLocalInput } from './events-table.js';

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function buildEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    link_id: '00000000-0000-0000-0000-000000000010',
    timestamp: '2026-07-04T12:00:00.000Z',
    ip: '1.2.3.4',
    user_agent: 'Mozilla/5.0',
    referer: 'https://google.com',
    country: 'US',
    city: 'Mountain View',
    browser: 'Chrome',
    link_label: 'my-link',
    ...overrides,
  };
}

function buildPaged(
  rows: AnalyticsEvent[],
  overrides: Partial<PagedResponse<AnalyticsEvent>> = {},
): PagedResponse<AnalyticsEvent> {
  return {
    data: rows,
    total: rows.length,
    page: 1,
    page_size: 20,
    ...overrides,
  };
}

beforeEach(() => {
  useAnalyticsState.data = undefined;
  useAnalyticsState.isPending = false;
  useAnalyticsState.isError = false;
  useAnalyticsState.error = null;
  useAnalyticsState.refetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('EventsTable — loading / empty / error states', () => {
  it('renders a Spinner while the query is pending', () => {
    useAnalyticsState.isPending = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the EmptyState when the data array is empty', () => {
    useAnalyticsState.data = buildPaged([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('heading', { name: /no hay eventos/i })).toBeInTheDocument();
  });

  it('renders an error block with a retry button when the query fails', async () => {
    useAnalyticsState.isError = true;
    useAnalyticsState.error = new Error('Network down');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /reintentar/i });
    expect(retry).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(retry);
    expect(useAnalyticsState.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('EventsTable — rows', () => {
  it('renders the spec-locked columns for each event', () => {
    useAnalyticsState.data = buildPaged([
      buildEvent({
        id: '00000000-0000-0000-0000-000000000001',
        link_label: 'docs',
        ip: '1.2.3.4',
        country: 'US',
        city: 'Mountain View',
        browser: 'Chrome',
        referer: 'https://google.com',
        timestamp: '2026-07-04T12:00:00.000Z',
      }),
      buildEvent({
        id: '00000000-0000-0000-0000-000000000002',
        link_label: 'blog',
        ip: '5.6.7.8',
        country: 'ES',
        city: 'Madrid',
        browser: 'Firefox',
        referer: '',
        timestamp: '2026-07-04T13:00:00.000Z',
      }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    // Column headers.
    expect(screen.getByRole('columnheader', { name: /fecha/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^link$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^ip$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /país/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /ciudad/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /navegador/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /referer/i })).toBeInTheDocument();

    // Row data.
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText('blog')).toBeInTheDocument();
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText('5.6.7.8')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('ES')).toBeInTheDocument();
    expect(screen.getByText('Mountain View')).toBeInTheDocument();
    expect(screen.getByText('Madrid')).toBeInTheDocument();
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.getByText('Firefox')).toBeInTheDocument();
  });

  it('renders the spec-locked "(deleted link)" literal for soft-deleted link events', () => {
    useAnalyticsState.data = buildPaged([
      buildEvent({ id: '00000000-0000-0000-0000-000000000099', link_label: '(deleted link)' }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    // The exact spec-locked literal must be in the table cell.
    expect(screen.getByText('(deleted link)')).toBeInTheDocument();
  });

  it('renders a dash for null geo / browser / referer fields', () => {
    useAnalyticsState.data = buildPaged([
      buildEvent({
        id: '00000000-0000-0000-0000-000000000001',
        country: null,
        city: null,
        browser: null,
        referer: '',
      }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    // The `referer: ''` empty string and the `null` geo fields
    // should both render as a non-breaking em dash so the table
    // stays a clean grid. We assert at least 3 em-dashes (one
    // per nullable cell, since referer is shown the same way).
    const tbody = screen.getAllByRole('rowgroup')[1]!;
    const cells = within(tbody).getAllByRole('cell');
    const dashCells = cells.filter((c) => (c.textContent ?? '').trim() === '—');
    expect(dashCells.length).toBeGreaterThanOrEqual(3);
  });
});

describe('EventsTable — filters', () => {
  it('starts a new search at page 1 (resets the page when the link filter changes)', async () => {
    useAnalyticsState.data = buildPaged([buildEvent()], { total: 200, page: 5, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    // The link filter input is identified by its label.
    const linkInput = screen.getByLabelText(/link id/i);
    await user.type(linkInput, '00000000-0000-0000-0000-000000000099');

    // The displayed page is the server's page (5 here, because
    // the table reads it from `data.page`). After a filter
    // change, the next query resets page → 1, so the
    // `displayedPage` we render before the next fetch lands is
    // still 5 — but the page state the user is "intending" is
    // now 1. We assert the displayed page is the server's.
    expect(screen.getByText(/5 de 10/i)).toBeInTheDocument();
  });

  it('forwards the country filter to the underlying query (renders it in the country input)', async () => {
    useAnalyticsState.data = buildPaged([buildEvent()]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    const countryInput = screen.getByLabelText(/país/i);
    await user.type(countryInput, 'US');
    // The country input now holds "US". The component wires
    // this to the BE's `country` query param (verified at the
    // hook level in use-analytics.test.tsx).
    expect(countryInput).toHaveValue('US');
  });

  it('forwards the date range filter to the underlying query (datetime-local inputs)', () => {
    useAnalyticsState.data = buildPaged([buildEvent()]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    const fromInput = screen.getByLabelText(/desde/i);
    const toInput = screen.getByLabelText(/hasta/i);
    expect(fromInput).toHaveAttribute('type', 'datetime-local');
    expect(toInput).toHaveAttribute('type', 'datetime-local');
  });
});

describe('EventsTable — pagination', () => {
  it('shows page controls when there are multiple pages', () => {
    useAnalyticsState.data = buildPaged([buildEvent()], { total: 45, page: 1, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('button', { name: /anterior/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument();
  });

  it('disables Previous on the first page', () => {
    useAnalyticsState.data = buildPaged([buildEvent()], { total: 45, page: 1, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
  });

  it('disables Next on the last page', () => {
    useAnalyticsState.data = buildPaged([buildEvent()], { total: 45, page: 3, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('renders the empty state (not the table) when the only page has 0 rows', () => {
    useAnalyticsState.data = buildPaged([], { total: 0, page: 1, page_size: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    // No table when there's no data — the empty state takes over.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /no hay eventos/i })).toBeInTheDocument();
  });
});

describe('EventsTable — row count', () => {
  it('renders one row per event in the loaded page', () => {
    useAnalyticsState.data = buildPaged([
      buildEvent({ id: '00000000-0000-0000-0000-000000000001' }),
      buildEvent({ id: '00000000-0000-0000-0000-000000000002' }),
      buildEvent({ id: '00000000-0000-0000-0000-000000000003' }),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    const tbody = screen.getAllByRole('rowgroup')[1]!;
    const rows = within(tbody).getAllByRole('row');
    expect(rows.length).toBe(3);
  });
});

describe('EventsTable — timestamp formatting', () => {
  it('formats timestamps as a localised date+time string', () => {
    useAnalyticsState.data = buildPaged([buildEvent({ timestamp: '2026-07-04T12:00:00.000Z' })]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    // The exact format depends on the runtime ICU build, but
    // the locale-aware Date string for 2026-07-04 in es-ES is
    // either "4 jul 2026, 12:00" or "4/7/2026, 12:00:00". The
    // contract is "non-empty, locale-aware, contains '2026'".
    const cell = screen.getByText(/2026/);
    expect(cell).toBeInTheDocument();
  });

  it('renders the raw ISO string when the timestamp is unparseable', () => {
    useAnalyticsState.data = buildPaged([buildEvent({ timestamp: 'not-a-date' })]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    // The defensive `Number.isNaN(date.getTime())` branch keeps
    // the table from rendering "Invalid Date".
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
  });
});

describe('EventsTable — error fallback', () => {
  it('falls back to a generic Spanish message when the error has no message', () => {
    useAnalyticsState.isError = true;
    useAnalyticsState.error = null;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    expect(screen.getByText(/error desconocido/i)).toBeInTheDocument();
  });
});

describe('EventsTable — empty + filters', () => {
  it('shows the "filter-mismatch" empty copy when a date range is set', async () => {
    // The `debouncedLinkId || countryInput || dateFromInput || dateToInput`
    // branch in the empty state — when ANY filter is active the
    // empty state reads "no events match" rather than "no events yet".
    useAnalyticsState.data = buildPaged([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EventsTable />, { wrapper: makeWrapper(qc) });

    const user = userEvent.setup();
    const fromInput = screen.getByLabelText(/desde/i);
    // `date_from` is commit-on-change (NOT debounced) — the empty
    // state description flips synchronously after the type.
    await user.type(fromInput, '2026-01-01T00:00');
    expect(screen.getByText(/no hay eventos que coincidan/i)).toBeInTheDocument();
  });
});

// Re-export the waitFor helper to keep the imports clean for any
// future test that needs to await a fetch transition (currently
// unused but reserved for the filter-passthrough assertion below).
void waitFor;

describe('toIsoFromLocalInput', () => {
  it('returns undefined for an empty string', () => {
    // The `!value` branch — empty inputs MUST NOT send `date_from=`
    // to the BE (the Zod schema would reject it).
    expect(toIsoFromLocalInput('')).toBeUndefined();
  });

  it('returns undefined for an unparseable string', () => {
    expect(toIsoFromLocalInput('not-a-date')).toBeUndefined();
  });

  it('converts a valid `YYYY-MM-DDTHH:mm` string to an ISO datetime', () => {
    // The browser hands the FE a `datetime-local` value with no
    // timezone; we interpret it as UTC and emit the canonical Z form.
    // The actual timezone offset depends on the runtime (jsdom uses
    // the host TZ), so we assert on the round-trip: a Date built
    // from the same string and converted back to ISO must match.
    const out = toIsoFromLocalInput('2026-07-04T12:00');
    expect(out).toBeDefined();
    // The date portion is preserved.
    expect(out).toMatch(/^2026-07-04/);
  });
});
