/**
 * `analytics-routes` — Fastify plugin for the `/api/analytics/*` endpoints.
 *
 * Exposes:
 *  - `GET /api/analytics/summary`     — 4 KPI summary
 *  - `GET /api/analytics`             — paginated events list
 *  - `GET /api/analytics/timeseries`  — bucketed timeseries
 *
 * The plugin is a thin adapter over the application-layer use-cases:
 *  1. Validate the request with the shared Zod schemas
 *     (`listAnalyticsQuerySchema`, `timeseriesQuerySchema`).
 *  2. Call the corresponding use-case from the injected `useCases` bag.
 *  3. Compose the API response shape (snake_case + ISO datetime).
 *  4. On domain error, delegate to `error-mapper` and reply with the
 *     RFC 7807 problem-details body.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #2, #3, #4
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { listAnalyticsQuerySchema, timeseriesQuerySchema } from '@shortpulse/shared';

import type { GetAnalyticsSummaryUseCase } from '../application/get-analytics-summary.use-case.js';
import type { ListAnalyticsUseCase } from '../application/list-analytics.use-case.js';
import type { GetTimeseriesUseCase } from '../application/get-timeseries.use-case.js';
import { mapDomainError } from './error-mapper.js';

export interface AnalyticsRoutesOptions {
  useCases: {
    getAnalyticsSummary: Pick<GetAnalyticsSummaryUseCase, 'execute'>;
    listAnalytics: Pick<ListAnalyticsUseCase, 'execute'>;
    getTimeseries: Pick<GetTimeseriesUseCase, 'execute'>;
  };
}

export const analyticsRoutes: FastifyPluginAsync<AnalyticsRoutesOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const { useCases } = options;

  // GET /api/analytics/summary — 4 KPI summary
  app.get('/api/analytics/summary', async (_request, reply) => {
    try {
      const summary = await useCases.getAnalyticsSummary.execute({});
      return reply.code(200).send({
        total_links: summary.totalLinks,
        total_clicks: summary.totalClicks,
        clicks_today: summary.clicksToday,
        clicks_last_7_days: summary.clicksLast7Days,
      });
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply
        .code(mapped.statusCode)
        .header('Content-Type', 'application/problem+json')
        .send(mapped.problem);
    }
  });

  // GET /api/analytics — paginated events list
  app.get('/api/analytics', async (request, reply) => {
    const parsed = listAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: parsed.error.issues[0]?.message ?? 'Invalid querystring',
        });
    }
    try {
      const q = parsed.data;
      const result = await useCases.listAnalytics.execute({
        page: q.page,
        pageSize: q.page_size,
        ...(q.link_id !== undefined ? { linkId: q.link_id } : {}),
        ...(q.date_from !== undefined ? { dateFrom: new Date(q.date_from) } : {}),
        ...(q.date_to !== undefined ? { dateTo: new Date(q.date_to) } : {}),
        ...(q.country !== undefined ? { country: q.country } : {}),
      });
      return reply.code(200).send({
        data: result.data.map((row) => ({
          id: row.id,
          link_id: row.linkId,
          timestamp: row.timestamp.toISOString(),
          ip: row.ip,
          user_agent: row.userAgent,
          referer: row.referer,
          country: row.country,
          city: row.city,
          browser: row.browser,
          link_label: row.linkLabel,
        })),
        total: result.total,
        page: result.page,
        page_size: result.pageSize,
      });
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply
        .code(mapped.statusCode)
        .header('Content-Type', 'application/problem+json')
        .send(mapped.problem);
    }
  });

  // GET /api/analytics/timeseries — bucketed timeseries
  app.get('/api/analytics/timeseries', async (request, reply) => {
    const parsed = timeseriesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: parsed.error.issues[0]?.message ?? 'Invalid querystring',
        });
    }
    try {
      const q = parsed.data;
      const result = await useCases.getTimeseries.execute({
        granularity: q.granularity,
        ...(q.date_from !== undefined ? { dateFrom: new Date(q.date_from) } : {}),
        ...(q.date_to !== undefined ? { dateTo: new Date(q.date_to) } : {}),
      });
      return reply.code(200).send({
        data: result.data.map((row) => ({
          bucket_start: row.bucketStart.toISOString(),
          count: row.count,
        })),
      });
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply
        .code(mapped.statusCode)
        .header('Content-Type', 'application/problem+json')
        .send(mapped.problem);
    }
  });
};
