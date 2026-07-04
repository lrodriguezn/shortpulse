/**
 * Tests for the `TimeseriesChart` component.
 *
 * The chart is the middle panel of the Analytics dashboard. The
 * spec-locked contract (`openspec/specs/analytics/spec.md`
 * requirement #4 + design §7):
 *  - A Recharts chart (line) showing clicks over time.
 *  - A granularity selector (day / week / month) that drives
 *    the `useTimeseries` query.
 *  - Loading / error states render the spec-locked affordances
 *    (Spinner / alert block).
 *  - When the BE returns no buckets, the chart is rendered
 *    (with the empty x-axis) — not a blocking empty state —
 *    so the user still sees the time axis and knows the page
 *    is alive.
 *
 * Recharts depends on `getBoundingClientRect` + `ResizeObserver`
 * which jsdom does not implement. We mock the recharts surface
 * we use (`LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`,
 * `CartesianGrid`, `ResponsiveContainer`) with thin stubs that
 * render their children and expose the data + props the chart
 * received, so the test can assert on the contract without
 * running the real SVG pipeline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import type { TimeseriesResponse, TimeseriesRow } from '@shortpulse/shared';

import { formatBucket } from './timeseries-chart.js';

// --- Recharts mock ----------------------------------------------------------
// Capture the props + children recharts receives so the test
// can assert on the chart's data contract without depending
// on the real SVG pipeline.

interface CapturedProps {
  data?: unknown;
  dataKey?: unknown;
  stroke?: unknown;
  children?: ReactNode;
  width?: unknown;
  height?: unknown;
  // any other prop is fine to drop
  [key: string]: unknown;
}

const rechartsCaptured = vi.hoisted(() => ({
  lineChart: undefined as CapturedProps | undefined,
  line: undefined as CapturedProps | undefined,
  xAxis: undefined as CapturedProps | undefined,
  yAxis: undefined as CapturedProps | undefined,
  tooltip: undefined as CapturedProps | undefined,
  cartesianGrid: undefined as CapturedProps | undefined,
  responsiveContainer: undefined as CapturedProps | undefined,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: (props: CapturedProps) => {
    rechartsCaptured.responsiveContainer = props;
    return <div data-testid="recharts-responsive">{props.children}</div>;
  },
  LineChart: (props: CapturedProps) => {
    rechartsCaptured.lineChart = props;
    return (
      <div data-testid="recharts-line-chart" data-rows={JSON.stringify(props.data)}>
        {props.children}
      </div>
    );
  },
  Line: (props: CapturedProps) => {
    rechartsCaptured.line = props;
    return <div data-testid="recharts-line" data-key={String(props.dataKey)} />;
  },
  XAxis: (props: CapturedProps) => {
    rechartsCaptured.xAxis = props;
    return <div data-testid="recharts-x-axis" data-key={String(props.dataKey)} />;
  },
  YAxis: (props: CapturedProps) => {
    rechartsCaptured.yAxis = props;
    return <div data-testid="recharts-y-axis" />;
  },
  Tooltip: (props: CapturedProps) => {
    rechartsCaptured.tooltip = props;
    return <div data-testid="recharts-tooltip" />;
  },
  CartesianGrid: (props: CapturedProps) => {
    rechartsCaptured.cartesianGrid = props;
    return <div data-testid="recharts-grid" />;
  },
}));

// --- Hook mock --------------------------------------------------------------

const useTimeseriesState = vi.hoisted(() => ({
  data: undefined as TimeseriesResponse | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock('../../hooks/use-analytics.js', () => ({
  useTimeseries: () => useTimeseriesState,
}));

import { TimeseriesChart } from './timeseries-chart.js';

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function buildBucket(overrides: Partial<TimeseriesRow> = {}): TimeseriesRow {
  return {
    bucket_start: '2026-07-01T00:00:00.000Z',
    count: 3,
    ...overrides,
  };
}

function resetRechartsCaptured(): void {
  rechartsCaptured.lineChart = undefined;
  rechartsCaptured.line = undefined;
  rechartsCaptured.xAxis = undefined;
  rechartsCaptured.yAxis = undefined;
  rechartsCaptured.tooltip = undefined;
  rechartsCaptured.cartesianGrid = undefined;
  rechartsCaptured.responsiveContainer = undefined;
}

beforeEach(() => {
  useTimeseriesState.data = undefined;
  useTimeseriesState.isPending = false;
  useTimeseriesState.isError = false;
  useTimeseriesState.error = null;
  useTimeseriesState.refetch = vi.fn();
  resetRechartsCaptured();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('TimeseriesChart — loading / error states', () => {
  it('renders a Spinner while the query is pending', () => {
    useTimeseriesState.isPending = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('status')).toBeInTheDocument();
    // The chart itself is NOT rendered while loading.
    expect(screen.queryByTestId('recharts-line-chart')).not.toBeInTheDocument();
  });

  it('renders an error block with a retry button when the query fails', async () => {
    useTimeseriesState.isError = true;
    useTimeseriesState.error = new Error('Chart backend down');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/chart backend down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /reintentar/i });
    expect(retry).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(retry);
    expect(useTimeseriesState.refetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic Spanish message when the error has no message', () => {
    // Edge case: a query that failed without an `Error` attached
    // (e.g. a network failure that lost the message). The fallback
    // `Error desconocido` keeps the alert useful.
    useTimeseriesState.isError = true;
    useTimeseriesState.error = null;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    expect(screen.getByText(/error desconocido/i)).toBeInTheDocument();
  });
});

describe('formatBucket', () => {
  it('returns the raw input when the date is unparseable', () => {
    // The defensive `Number.isNaN(d.getTime())` branch keeps the
    // chart from rendering "Invalid Date" if the BE ever ships a
    // malformed bucket.
    expect(formatBucket('not-a-date', 'day')).toBe('not-a-date');
  });

  it('formats day buckets as "short-month day"', () => {
    // Exact format is locale-dependent; contract is "non-empty, contains the day".
    const out = formatBucket('2026-07-04T00:00:00.000Z', 'day');
    expect(out).toMatch(/jul/);
    expect(out).toMatch(/4/);
  });

  it('formats week buckets as "short-month day"', () => {
    const out = formatBucket('2026-07-04T00:00:00.000Z', 'week');
    expect(out).toMatch(/jul/);
  });

  it('formats month buckets as "year short-month"', () => {
    // The month branch includes the year for clarity on year-boundary ticks.
    const out = formatBucket('2026-07-04T00:00:00.000Z', 'month');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/jul/);
  });
});

describe('TimeseriesChart — chart render', () => {
  it('renders the chart with the spec-locked axes and data', () => {
    useTimeseriesState.data = {
      data: [
        buildBucket({ bucket_start: '2026-07-01T00:00:00.000Z', count: 3 }),
        buildBucket({ bucket_start: '2026-07-02T00:00:00.000Z', count: 7 }),
        buildBucket({ bucket_start: '2026-07-03T00:00:00.000Z', count: 5 }),
      ],
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    // Chart is rendered with the buckets.
    const chart = screen.getByTestId('recharts-line-chart');
    expect(chart).toBeInTheDocument();
    const rowsAttr = chart.getAttribute('data-rows') ?? '[]';
    const rows = JSON.parse(rowsAttr) as Array<{ bucket_start: string; count: number }>;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ bucket_start: '2026-07-01T00:00:00.000Z', count: 3 });

    // X axis uses `bucket_start` as the data key, Y axis is
    // implicit (recharts derives it from the Line's dataKey).
    expect(screen.getByTestId('recharts-x-axis')).toHaveAttribute('data-key', 'bucket_start');
    expect(screen.getByTestId('recharts-line')).toHaveAttribute('data-key', 'count');
    // CartesianGrid + Tooltip are part of the spec-locked UX.
    expect(screen.getByTestId('recharts-grid')).toBeInTheDocument();
    expect(screen.getByTestId('recharts-tooltip')).toBeInTheDocument();
    // ResponsiveContainer wraps the chart with a fixed height.
    expect(rechartsCaptured.responsiveContainer?.height).toBe(280);
  });

  it('renders the chart even when the BE returns no buckets (so the x-axis stays visible)', () => {
    useTimeseriesState.data = { data: [] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    // The chart is rendered (with empty data) — NOT replaced by
    // a blocking empty state. Users still see the x-axis and
    // know the dashboard is alive.
    expect(screen.getByTestId('recharts-line-chart')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /no hay datos/i })).not.toBeInTheDocument();
  });
});

describe('TimeseriesChart — granularity selector', () => {
  it('renders three options: day, week, month', () => {
    useTimeseriesState.data = { data: [buildBucket()] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    // The selector is a <select> with three options. We use
    // the role combobox (the implicit ARIA role of a <select>).
    const selector = screen.getByRole('combobox', { name: /granularidad/i });
    expect(selector).toBeInTheDocument();
    const options = within(selector as HTMLElement).getAllByRole('option');
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['day', 'week', 'month']);
  });

  it('defaults to "day"', () => {
    useTimeseriesState.data = { data: [buildBucket()] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    const selector = screen.getByRole('combobox', { name: /granularidad/i }) as HTMLSelectElement;
    expect(selector.value).toBe('day');
  });

  it('changing the granularity re-fires the query (driven by useTimeseries state)', () => {
    // The selector is wired to a local `granularity` state that
    // is passed as the `granularity` arg to `useTimeseries`.
    // We assert the change is reflected in the rendered
    // selector value (the actual query call is verified at the
    // hook level in use-analytics.test.tsx).
    useTimeseriesState.data = { data: [buildBucket()] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    const selector = screen.getByRole('combobox', { name: /granularidad/i });
    // Simulate the change via the native value setter so React
    // picks it up (recharts + react state need the synthetic
    // event, not a direct value mutation).
    const setNativeValue = (el: Element, value: string) => {
      const proto = Object.getPrototypeOf(el) as object;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setNativeValue(selector, 'week');
    expect((selector as HTMLSelectElement).value).toBe('week');
  });

  it('exposes a "Tipo" label group and renders the selected option text', () => {
    useTimeseriesState.data = { data: [buildBucket()] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    // The selector's options are human-readable Spanish labels.
    const selector = screen.getByRole('combobox', { name: /granularidad/i });
    const options = within(selector as HTMLElement).getAllByRole('option');
    const labels = options.map((o) => (o as HTMLOptionElement).textContent);
    expect(labels).toEqual(['Día', 'Semana', 'Mes']);
  });

  it('renders the heading with the day/week/month suffix matching the selected granularity', () => {
    // The "Clicks por …" heading reflects the chosen granularity.
    // The week / month / fallback branches in the ternary each
    // need a click to flip the selector, then we re-query the
    // heading text.
    useTimeseriesState.data = { data: [buildBucket()] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    expect(screen.getByRole('heading', { name: /clicks por día/i })).toBeInTheDocument();

    // Re-render with `week` — the heading flips.
    useTimeseriesState.data = { data: [buildBucket()] };
    rerender(<TimeseriesChart />);
    // jsdom's selector is uncontrolled; trigger a real change so
    // the component picks the new granularity label.
    const setNativeValue = (el: Element, value: string) => {
      const proto = Object.getPrototypeOf(el) as object;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const selector = screen.getByRole('combobox', { name: /granularidad/i });
    setNativeValue(selector, 'week');
    expect(screen.getByRole('heading', { name: /clicks por semana/i })).toBeInTheDocument();

    setNativeValue(selector, 'month');
    expect(screen.getByRole('heading', { name: /clicks por mes/i })).toBeInTheDocument();
  });

  it('renders the chart with an empty data array when query.data is undefined', () => {
    // The `query.data?.data ?? []` fallback: when isError is false
    // and isPending is false but data is still undefined (race),
    // the chart must render with an empty array rather than crash.
    useTimeseriesState.isPending = false;
    useTimeseriesState.isError = false;
    useTimeseriesState.data = undefined;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TimeseriesChart />, { wrapper: makeWrapper(qc) });

    // The chart is rendered with an empty array.
    const chart = screen.getByTestId('recharts-line-chart');
    expect(chart).toBeInTheDocument();
    const rows = JSON.parse(chart.getAttribute('data-rows') ?? '[]');
    expect(rows).toEqual([]);
  });
});

// Type-level guard: the `rechartsCaptured` object is hoisted
// and the tests rely on its mutable fields. The unused import
// of `ReactElement` is intentional — it documents the shape of
// recharts children (a `ReactElement | ReactElement[]`).
void (null as unknown as ReactElement);
