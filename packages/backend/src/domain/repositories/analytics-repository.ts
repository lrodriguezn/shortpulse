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
 *  - `listWithLinkLabel` MUST return the joined slug per event, or
 *    `null` for events whose link is soft-deleted (spec analytics #3
 *    + #5, design ADR-004). The application layer is responsible for
 *    rendering the spec-locked `"(deleted link)"` literal (obs #7) —
 *    keeping the slug in raw form preserves the SQL contract and
 *    makes the rendering testable at the use-case boundary. The
 *    Drizzle impl will achieve this with a `LEFT JOIN links` and a
 *    `WHERE links.deleted_at IS NULL OR NULL` projection; the simpler
 *    `list` method (no join) is kept for callers that don't need
 *    presentation labels.
 *  - `getTimeseries` MUST bucket by the requested granularity in UTC.
 */
export interface AnalyticsRepository {
  /** Persist a new event. Returns the persisted event. */
  save(event: AnalyticsEvent): Promise<AnalyticsEvent>;
  /** Paginated events list, filterable. Pure event rows — no slug join. */
  list(query: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }>;
  /**
   * Paginated events list joined with the link's slug.
   *
   * Returns each event paired with the link's current `slug` or `null`
   * when the link is soft-deleted. The application layer maps
   * `null → "(deleted link)"` so the spec-locked literal stays in
   * one place (the use-case), testable without touching SQL.
   */
  listWithLinkLabel(
    query: AnalyticsListQuery,
  ): Promise<{ data: Array<AnalyticsEvent & { slug: string | null }>; total: number }>;
  /** KPI summary. */
  getSummary(): Promise<AnalyticsSummary>;
  /** Timeseries over a date range, bucketed by `granularity`. */
  getTimeseries(
    granularity: 'day' | 'week' | 'month',
    dateRange: { from: Date; to: Date },
  ): Promise<TimeseriesBucket[]>;
}
