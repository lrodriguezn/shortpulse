/**
 * Tests for the `AnalyticsPage` composition.
 *
 * The page is the spec-locked destination for `/analytics`:
 * it composes the `KpiCards` (top), `TimeseriesChart` (middle),
 * and `EventsTable` (bottom) so a user can read the high-level
 * KPIs, drill into the timeseries trend, and inspect individual
 * events — all on one page.
 *
 * The page itself is a thin presentational wrapper: no state,
 * no side effects. Each child component owns its own state
 * (TanStack Query, RHF, etc.). The page wires them together
 * vertically in the spec-locked order: KPIs → chart → table.
 *
 * We mock the children (cards, chart, table) to assert the
 * page composes them in the right order, exposes the right
 * section heading, and the route integration is verified by
 * the router test in `routes/analytics.test.tsx`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./kpi-cards.js', () => ({
  KpiCards: () => <div data-testid="kpi-cards-stub">KpiCards stub</div>,
}));

vi.mock('./timeseries-chart.js', () => ({
  TimeseriesChart: () => <div data-testid="timeseries-chart-stub">TimeseriesChart stub</div>,
}));

vi.mock('./events-table.js', () => ({
  EventsTable: () => <div data-testid="events-table-stub">EventsTable stub</div>,
}));

import { AnalyticsPage } from './analytics-page.js';

describe('AnalyticsPage', () => {
  it('renders the KPI cards, the timeseries chart, and the events table', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('kpi-cards-stub')).toBeInTheDocument();
    expect(screen.getByTestId('timeseries-chart-stub')).toBeInTheDocument();
    expect(screen.getByTestId('events-table-stub')).toBeInTheDocument();
  });

  it('renders a page heading for the Analytics section', () => {
    render(<AnalyticsPage />);
    expect(screen.getByRole('heading', { name: /^analíticas$/i, level: 1 })).toBeInTheDocument();
  });

  it('composes the sections in the spec-locked order: KPIs → chart → table', () => {
    render(<AnalyticsPage />);
    const kpis = screen.getByTestId('kpi-cards-stub');
    const chart = screen.getByTestId('timeseries-chart-stub');
    const table = screen.getByTestId('events-table-stub');

    // `DOCUMENT_POSITION_FOLLOWING` means "this node is
    // followed by the argument node" in document order. So
    // kpis precedes chart, and chart precedes table.
    expect(kpis.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chart.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('exposes a labelled region for the page content', () => {
    render(<AnalyticsPage />);
    expect(screen.getByRole('region', { name: /^analíticas$/i })).toBeInTheDocument();
  });
});
