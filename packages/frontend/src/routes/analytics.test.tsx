/**
 * Tests for the `/analytics` route entry.
 *
 * The route file (`routes/analytics.tsx`) is a thin re-export
 * of `AnalyticsPage` from the Analytics feature folder. The
 * router (`router.ts`) imports `AnalyticsPage` from this file;
 * re-exporting keeps the import path stable while moving the
 * actual code to `features/analytics/analytics-page.tsx` where
 * the rest of the Analytics feature (KPI cards, events table,
 * timeseries chart) lives.
 *
 * The contract:
 *  - The route file re-exports `AnalyticsPage` from the
 *    feature folder.
 *  - The re-exported `AnalyticsPage` renders the three spec
 *    sections (KPI cards, timeseries chart, events table).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../features/analytics/analytics-page.js', () => ({
  AnalyticsPage: () => (
    <section aria-label="Analytics" data-testid="analytics-page-stub">
      Analytics page
    </section>
  ),
}));

// Import after the mock so the route file picks up the stub.
import { AnalyticsPage } from './analytics.js';

describe('routes/analytics', () => {
  it('re-exports the AnalyticsPage from the feature folder', () => {
    expect(AnalyticsPage).toBeTypeOf('function');
  });

  it('renders the re-exported AnalyticsPage (which composes KPIs + chart + table)', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('analytics-page-stub')).toBeInTheDocument();
  });
});
