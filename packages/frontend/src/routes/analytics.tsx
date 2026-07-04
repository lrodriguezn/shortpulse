/**
 * Analytics page — `routes/analytics.tsx`.
 *
 * Phase 7 shipped a placeholder so the route resolved from
 * day one. Phase 9 lands the real implementation: a re-export
 * of `AnalyticsPage` from the Analytics feature folder. The
 * router (`router.ts`) imports `AnalyticsPage` from this
 * file; re-exporting keeps the import path stable while
 * moving the actual code to `features/analytics/analytics-page.tsx`
 * where the rest of the Analytics feature (KPI cards, events
 * table, timeseries chart) lives.
 */
export { AnalyticsPage } from '../features/analytics/analytics-page.js';
