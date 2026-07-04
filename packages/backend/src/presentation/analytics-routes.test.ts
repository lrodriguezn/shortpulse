/**
 * Integration tests for `analytics-routes` (Fastify plugin).
 *
 * The plugin is mounted on `/api/analytics` and exposes:
 *  - `GET /api/analytics/summary`     — 200 + analyticsSummarySchema
 *  - `GET /api/analytics`             — 200 + {data, total, page, page_size}
 *  - `GET /api/analytics/timeseries`  — 200 + timeseriesResponseSchema
 *
 * Tests use Fastify `inject()` with mocked use-cases — no DB, no
 * MaxMind file. The mocks implement the same `execute(input)` shape
 * the production use-cases do, so the routing + validation +
 * error-mapping is exercised end-to-end.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #2, #3, #4
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Fastify, { type FastifyInstance } from 'fastify';

import { analyticsRoutes } from './analytics-routes.js';

import type { GetAnalyticsSummaryUseCase } from '../application/get-analytics-summary.use-case.js';
import type { ListAnalyticsUseCase } from '../application/list-analytics.use-case.js';
import type { GetTimeseriesUseCase } from '../application/get-timeseries.use-case.js';
import type { AnalyticsEventWithLabel } from '../application/list-analytics.use-case.js';

interface AnalyticsStubs {
  getAnalyticsSummary: Pick<GetAnalyticsSummaryUseCase, 'execute'>;
  listAnalytics: Pick<ListAnalyticsUseCase, 'execute'>;
  getTimeseries: Pick<GetTimeseriesUseCase, 'execute'>;
}

function buildStubs() {
  const getAnalyticsSummary = vi.fn();
  const listAnalytics = vi.fn();
  const getTimeseries = vi.fn();
  return {
    stubs: {
      getAnalyticsSummary: { execute: getAnalyticsSummary },
      listAnalytics: { execute: listAnalytics },
      getTimeseries: { execute: getTimeseries },
    },
    getAnalyticsSummary,
    listAnalytics,
    getTimeseries,
  };
}

async function buildApp(stubs: AnalyticsStubs): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(analyticsRoutes, { useCases: stubs });
  return app;
}

describe('analytics-routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { stubs } = buildStubs();
    app = await buildApp(stubs);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/analytics/summary', () => {
    it('returns 200 + 4 KPIs on success', async () => {
      const { stubs, getAnalyticsSummary } = buildStubs();
      const testApp = await buildApp(stubs);
      getAnalyticsSummary.mockResolvedValueOnce({
        totalLinks: 5,
        totalClicks: 100,
        clicksToday: 7,
        clicksLast7Days: 42,
      });

      const response = await testApp.inject({
        method: 'GET',
        url: '/api/analytics/summary',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        total_links: 5,
        total_clicks: 100,
        clicks_today: 7,
        clicks_last_7_days: 42,
      });
      expect(getAnalyticsSummary).toHaveBeenCalledWith({});
      await testApp.close();
    });
  });

  describe('GET /api/analytics', () => {
    it('returns 200 + {data, total, page, page_size} on success', async () => {
      const { stubs, listAnalytics } = buildStubs();
      const testApp = await buildApp(stubs);
      const event: AnalyticsEventWithLabel = {
        id: '00000000-0000-0000-0000-000000000001',
        linkId: '00000000-0000-0000-0000-000000000010',
        timestamp: new Date('2026-07-04T12:00:00.000Z'),
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        referer: 'https://google.com',
        country: 'US',
        city: 'Mountain View',
        browser: 'Chrome',
        linkLabel: 'my-link',
      };
      listAnalytics.mockResolvedValueOnce({ data: [event], total: 1, page: 1, pageSize: 20 });

      const response = await testApp.inject({
        method: 'GET',
        url: '/api/analytics?page=1&page_size=20',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        data: [
          {
            id: event.id,
            link_id: event.linkId,
            timestamp: event.timestamp.toISOString(),
            ip: '1.2.3.4',
            user_agent: 'Mozilla/5.0',
            referer: 'https://google.com',
            country: 'US',
            city: 'Mountain View',
            browser: 'Chrome',
            link_label: 'my-link',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      });
      expect(listAnalytics).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        linkId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        country: undefined,
      });
      await testApp.close();
    });

    it('renders the spec-locked "(deleted link)" label for soft-deleted links', async () => {
      const { stubs, listAnalytics } = buildStubs();
      const testApp = await buildApp(stubs);
      const event: AnalyticsEventWithLabel = {
        id: '00000000-0000-0000-0000-000000000001',
        linkId: '00000000-0000-0000-0000-000000000010',
        timestamp: new Date('2026-07-04T12:00:00.000Z'),
        ip: '1.2.3.4',
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
        linkLabel: '(deleted link)',
      };
      listAnalytics.mockResolvedValueOnce({ data: [event], total: 1, page: 1, pageSize: 20 });

      const response = await testApp.inject({ method: 'GET', url: '/api/analytics' });
      expect(response.statusCode).toBe(200);
      expect(response.json().data[0]?.link_label).toBe('(deleted link)');
      await testApp.close();
    });

    it('passes linkId, dateFrom, dateTo, country filters through to the use-case', async () => {
      const { stubs, listAnalytics } = buildStubs();
      const testApp = await buildApp(stubs);
      listAnalytics.mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 20 });

      const linkId = '00000000-0000-0000-0000-000000000010';
      const response = await testApp.inject({
        method: 'GET',
        url: `/api/analytics?link_id=${linkId}&country=US&date_from=2026-01-01T00:00:00.000Z&date_to=2026-07-04T23:59:59.999Z`,
      });

      expect(response.statusCode).toBe(200);
      expect(listAnalytics).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        linkId,
        dateFrom: new Date('2026-01-01T00:00:00.000Z'),
        dateTo: new Date('2026-07-04T23:59:59.999Z'),
        country: 'US',
      });
      await testApp.close();
    });

    it('returns 400 on Zod validation failure (page_size > 100)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/analytics?page_size=9999' });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/analytics/timeseries', () => {
    it('returns 200 + {data: [{bucket_start, count}]} on success', async () => {
      const { stubs, getTimeseries } = buildStubs();
      const testApp = await buildApp(stubs);
      getTimeseries.mockResolvedValueOnce({
        data: [
          { bucketStart: new Date('2026-07-01T00:00:00.000Z'), count: 3 },
          { bucketStart: new Date('2026-07-02T00:00:00.000Z'), count: 7 },
        ],
      });

      const response = await testApp.inject({
        method: 'GET',
        url: '/api/analytics/timeseries?granularity=day',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          { bucket_start: '2026-07-01T00:00:00.000Z', count: 3 },
          { bucket_start: '2026-07-02T00:00:00.000Z', count: 7 },
        ],
      });
      expect(getTimeseries).toHaveBeenCalledTimes(1);
      const call = getTimeseries.mock.calls[0]![0] as {
        granularity: string;
        dateFrom?: Date;
        dateTo?: Date;
      };
      expect(call.granularity).toBe('day');
      // When dateFrom/dateTo are omitted in the querystring, the
      // plugin forwards `undefined` to the use-case — the use-case
      // itself applies the 30-day default window (design §5 +
      // spec analytics #4). We just verify the field is omitted.
      expect(call.dateFrom).toBeUndefined();
      expect(call.dateTo).toBeUndefined();
      await testApp.close();
    });

    it('passes explicit dateFrom / dateTo through to the use-case', async () => {
      const { stubs, getTimeseries } = buildStubs();
      const testApp = await buildApp(stubs);
      getTimeseries.mockResolvedValueOnce({ data: [] });

      const response = await testApp.inject({
        method: 'GET',
        url: '/api/analytics/timeseries?granularity=week&date_from=2026-01-01T00:00:00.000Z&date_to=2026-07-04T00:00:00.000Z',
      });

      expect(response.statusCode).toBe(200);
      expect(getTimeseries).toHaveBeenCalledWith({
        granularity: 'week',
        dateFrom: new Date('2026-01-01T00:00:00.000Z'),
        dateTo: new Date('2026-07-04T00:00:00.000Z'),
      });
      await testApp.close();
    });

    it('returns 400 when granularity is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/timeseries',
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when granularity is invalid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/timeseries?granularity=hour',
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
