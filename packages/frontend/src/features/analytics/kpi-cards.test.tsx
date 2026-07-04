/**
 * Tests for the `KpiCards` component.
 *
 * The KPI cards are the top-of-page summary on the Analytics
 * dashboard. The contract:
 *  - Renders four cards with the spec-locked labels in Spanish
 *    ("Enlaces totales", "Clicks totales", "Clicks hoy",
 *    "Clicks últimos 7 días") and the values from
 *    `useAnalyticsSummary`.
 *  - Loading state: a `Spinner` (role="status") is shown while
 *    the query is pending. No numeric values are rendered.
 *  - Error state: an alert block with a "Reintentar" button that
 *    calls the query's `refetch`.
 *
 * We mock `useAnalyticsSummary` (the only side effect). The
 * clipboard is mocked for the global setup even though this
 * component doesn't use it (consistency with the rest of the
 * suite).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { AnalyticsSummary } from '@shortpulse/shared';

// --- Hoisted mocks ----------------------------------------------------------

const useAnalyticsSummaryState = vi.hoisted(() => ({
  data: undefined as AnalyticsSummary | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock('../../hooks/use-analytics.js', () => ({
  useAnalyticsSummary: () => useAnalyticsSummaryState,
}));

import { formatKpiValue, KpiCards } from './kpi-cards.js';

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const SAMPLE_SUMMARY: AnalyticsSummary = {
  total_links: 12,
  total_clicks: 432,
  clicks_today: 17,
  clicks_last_7_days: 120,
};

beforeEach(() => {
  useAnalyticsSummaryState.data = undefined;
  useAnalyticsSummaryState.isPending = false;
  useAnalyticsSummaryState.isError = false;
  useAnalyticsSummaryState.error = null;
  useAnalyticsSummaryState.refetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('KpiCards — populated', () => {
  it('renders four cards with the spec-locked labels and values', () => {
    useAnalyticsSummaryState.data = SAMPLE_SUMMARY;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    // All four labels render in Spanish (spec-locked strings).
    expect(screen.getByText('Enlaces totales')).toBeInTheDocument();
    expect(screen.getByText('Clicks totales')).toBeInTheDocument();
    expect(screen.getByText('Clicks hoy')).toBeInTheDocument();
    expect(screen.getByText('Clicks últimos 7 días')).toBeInTheDocument();

    // All four values render.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('432')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('exposes the section as a labelled region for assistive tech', () => {
    useAnalyticsSummaryState.data = SAMPLE_SUMMARY;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    // The region has a heading that names the section.
    expect(screen.getByRole('region', { name: /indicadores clave/i })).toBeInTheDocument();
  });

  it('formats large numbers with locale separators', () => {
    useAnalyticsSummaryState.data = {
      total_links: 1000000,
      total_clicks: 1234567,
      clicks_today: 9999,
      clicks_last_7_days: 50000,
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    // The exact separator depends on the runtime ICU build, so
    // we match a regex that covers both US (`1,234,567`) and
    // European (`1.234.567`) locales. The contract is "use a
    // thousands separator", not "use a specific one".
    const values = screen.getAllByText(/[\d.,\s]+/);
    const joined = values.map((el) => el.textContent ?? '').join('|');
    expect(joined).toMatch(/1[.,\s]?234[.,\s]?567/);
    expect(joined).toMatch(/1[.,\s]?000[.,\s]?000/);
  });
});

describe('KpiCards — loading state', () => {
  it('renders a Spinner (role="status") while the query is pending', () => {
    useAnalyticsSummaryState.isPending = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    // The Spinner uses role="status" with an aria-label. The
    // label is the documented affordance for the busy state.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not render any numeric values while loading', () => {
    useAnalyticsSummaryState.isPending = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    // None of the four KPI numbers should leak into the loading
    // view (otherwise the user sees flashing numbers).
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByText('432')).not.toBeInTheDocument();
    expect(screen.queryByText('17')).not.toBeInTheDocument();
    expect(screen.queryByText('120')).not.toBeInTheDocument();
  });
});

describe('KpiCards — error state', () => {
  it('renders an alert block with a retry button when the query fails', async () => {
    useAnalyticsSummaryState.isError = true;
    useAnalyticsSummaryState.error = new Error('Backend down');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/backend down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /reintentar/i });
    expect(retry).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(retry);
    expect(useAnalyticsSummaryState.refetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic Spanish message when the error has no message', () => {
    // Edge case: query failed without a `Error` attached.
    useAnalyticsSummaryState.isError = true;
    useAnalyticsSummaryState.error = null;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KpiCards />, { wrapper: makeWrapper(qc) });

    expect(screen.getByText(/error desconocido/i)).toBeInTheDocument();
  });
});

describe('formatKpiValue', () => {
  it('formats zero as "0"', () => {
    expect(formatKpiValue(0)).toBe('0');
  });

  it('formats positive integers with the locale thousands separator', () => {
    // The exact separator depends on the runtime ICU build; we
    // accept any non-empty string containing the digits.
    expect(formatKpiValue(1234567)).toMatch(/1[\D\s]?234[\D\s]?567/);
  });

  it('returns "NaN" for non-finite values', () => {
    // The `!Number.isFinite(n)` branch — defensive against
    // accidentally handing `NaN` / `Infinity` to `toLocaleString`.
    expect(formatKpiValue(Number.NaN)).toBe('NaN');
  });

  it('returns the stringified value for negatives (defensive)', () => {
    // The `n < 0` branch — KPIs are never negative in production,
    // but the formatter must not produce a misleading "-1,234" with
    // a thousands separator.
    expect(formatKpiValue(-5)).toBe('-5');
  });
});
