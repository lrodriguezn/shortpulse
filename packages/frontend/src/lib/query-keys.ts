/**
 * Query-key factory for TanStack Query.
 *
 * Centralising the cache-key shape in one place means every hook
 * (links + analytics) and every `invalidateQueries` / `setQueryData`
 * call use the same tuple. TanStack Query treats two keys as equal
 * when their entries are deeply equal, so the factory returns plain
 * tuples with the query params inline; callers can spread
 * additional filters without breaking the equality contract.
 */
import type { ListAnalyticsQuery, ListLinksQuery, TimeseriesQuery } from '@shortpulse/shared';

export const qk = {
  links: {
    all: ['links'] as const,
    list: (params: Partial<ListLinksQuery>) => ['links', 'list', params] as const,
  },
  analytics: {
    summary: ['analytics', 'summary'] as const,
    events: (params: Partial<ListAnalyticsQuery>) => ['analytics', 'events', params] as const,
    timeseries: (params: TimeseriesQuery) => ['analytics', 'timeseries', params] as const,
  },
};
