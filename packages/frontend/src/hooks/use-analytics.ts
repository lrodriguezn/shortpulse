/**
 * Analytics TanStack Query hooks.
 *
 * - `useAnalyticsSummary` \u2014 4 KPI summary; the dashboard's
 *   top-of-page number cards consume this.
 * - `useAnalytics` \u2014 events list with the same pagination /
 *   filter contract as the links list.
 * - `useTimeseries` \u2014 bucketed series for the Recharts chart.
 *
 * All three share the same `staleTime` (60s) and re-fetch policy
 * as the links hooks so the dashboard is consistent.
 */
import { useQuery } from '@tanstack/react-query';
import type { ListAnalyticsQuery, TimeseriesQuery } from '@shortpulse/shared';

import { getAnalyticsSummary, getTimeseries, listAnalytics } from '../lib/api.js';
import { qk } from '../lib/query-keys.js';

const STALE_TIME_MS = 60_000;

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: qk.analytics.summary,
    queryFn: ({ signal }) => getAnalyticsSummary(signal),
    staleTime: STALE_TIME_MS,
  });
}

export function useAnalytics(params: Partial<ListAnalyticsQuery> = {}) {
  return useQuery({
    queryKey: qk.analytics.events(params),
    queryFn: ({ signal }) => listAnalytics(params, signal),
    staleTime: STALE_TIME_MS,
  });
}

export function useTimeseries(params: TimeseriesQuery) {
  return useQuery({
    queryKey: qk.analytics.timeseries(params),
    queryFn: ({ signal }) => getTimeseries(params, signal),
    staleTime: STALE_TIME_MS,
  });
}
