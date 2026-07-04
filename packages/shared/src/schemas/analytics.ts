/**
 * Zod request/response schemas for the `/api/analytics/*` endpoints.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #1-#4
 *  - `openspec/changes/add-shortpulse-app/design.md` §5
 */
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TIMESERIES_GRANULARITIES } from '../constants.js';

/** A single analytics event. Returned by `GET /api/analytics`. */
export const analyticsEventSchema = z.object({
  link_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  ip: z.string(),
  user_agent: z.string(),
  referer: z.string(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  browser: z.string().nullable(),
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

/** Summary KPIs returned by `GET /api/analytics/summary`. */
export const analyticsSummarySchema = z.object({
  total_links: z.number().int().nonnegative(),
  total_clicks: z.number().int().nonnegative(),
  clicks_today: z.number().int().nonnegative(),
  clicks_last_7_days: z.number().int().nonnegative(),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

/** Querystring for `GET /api/analytics`. All filters optional. */
export const listAnalyticsQuerySchema = z.object({
  link_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  country: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ListAnalyticsQuery = z.infer<typeof listAnalyticsQuerySchema>;

/**
 * Querystring for `GET /api/analytics/timeseries`. `granularity` is required
 * and constrained to the spec-locked set; date_from/date_to are optional
 * (default range: last 30 days per spec analytics #4).
 */
export const timeseriesQuerySchema = z.object({
  granularity: z.enum(TIMESERIES_GRANULARITIES),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;

/** One bucket in a timeseries response. */
export const timeseriesRowSchema = z.object({
  bucket_start: z.string().datetime(),
  count: z.number().int().nonnegative(),
});
export type TimeseriesRow = z.infer<typeof timeseriesRowSchema>;

/** Body of `GET /api/analytics/timeseries`. */
export const timeseriesResponseSchema = z.object({
  data: z.array(timeseriesRowSchema),
});
export type TimeseriesResponse = z.infer<typeof timeseriesResponseSchema>;
