/**
 * `AnalyticsRepository` — domain-side interface for analytics persistence.
 *
 * The application layer (Phase 4) depends ONLY on this interface; the
 * concrete Drizzle implementation lives in Phase 5
 * (`infrastructure/drizzle-analytics.repository.ts`).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #1-#4
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (ports & adapters)
 */
import type { AnalyticsEvent } from '../entities/analytics-event.js';

/** Querystring for the paginated events list (GET /api/analytics). */
export interface AnalyticsListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly linkId?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly country?: string;
}

/** Summary KPIs returned by `GET /api/analytics/summary`. */
export interface AnalyticsSummary {
  readonly totalLinks: number;
  readonly totalClicks: number;
  readonly clicksToday: number;
  readonly clicksLast7Days: number;
}

/** Single bucket in a timeseries response. */
export interface TimeseriesBucket {
  readonly bucketStart: Date;
  readonly count: number;
}

/** Timeseries request — granularity + range. */
export interface TimeseriesQuery {
  readonly granularity: 'day' | 'week' | 'month';
  readonly dateRange: { readonly from: Date; readonly to: Date };
}

/**
 * Domain-side contract for analytics persistence.
 *
 * Implementations MUST:
 *  - Insert a row for every event synchronously (design ADR-002).
 *  - `getSummary` MUST count soft-deleted-link clicks toward
 *    `totalClicks` (spec analytics #2 + #5, design ADR-004).
 *  - `list` MUST render the link slug or `"(deleted link)"` per
 *    spec analytics #3 + #5 — this is normally done via a LEFT JOIN in
 *    the Drizzle layer. The interface only carries the `event`; the
 *    slug coalescing is a presentation concern in the API response,
 *    so the DTO is the (event, slug) pair. For simplicity the
 *    interface returns just the event; the Phase 5 implementation can
 *    extend the row type internally.
 *  - `getTimeseries` MUST bucket by the requested granularity in UTC.
 */
export interface AnalyticsRepository {
  /** Persist a new event. Returns the persisted event. */
  save(event: AnalyticsEvent): Promise<AnalyticsEvent>;
  /** Paginated events list, filterable. */
  list(query: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }>;
  /** KPI summary. */
  getSummary(): Promise<AnalyticsSummary>;
  /** Timeseries over a date range, bucketed by `granularity`. */
  getTimeseries(
    granularity: 'day' | 'week' | 'month',
    dateRange: { from: Date; to: Date },
  ): Promise<TimeseriesBucket[]>;
}
