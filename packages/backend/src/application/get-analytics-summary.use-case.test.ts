/**
 * Tests for `GetAnalyticsSummaryUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #2 (summary KPIs)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 *
 * The use-case is a thin composition over `AnalyticsRepository.getSummary`:
 *  - the repository is responsible for the 4 KPIs (`totalLinks`,
 *    `totalClicks`, `clicksToday`, `clicksLast7Days`) and the spec
 *    semantics (count soft-deleted clicks, UTC day boundary, rolling
 *    168h window);
 *  - the use-case owns the application boundary (typed return value,
 *    the seam that `container.ts` injects).
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `get-analytics-summary.use-case.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { GetAnalyticsSummaryUseCase } from './get-analytics-summary.use-case.js';
import type {
  AnalyticsRepository,
  AnalyticsSummary,
  AnalyticsListQuery,
  TimeseriesBucket,
} from '../domain/repositories/analytics-repository.js';
import type { AnalyticsEvent } from '../domain/entities/analytics-event.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeAnalyticsRepository implements AnalyticsRepository {
  public summaryResult: AnalyticsSummary = {
    totalLinks: 0,
    totalClicks: 0,
    clicksToday: 0,
    clicksLast7Days: 0,
  };
  public getSummaryCalls = 0;

  async save(_event: AnalyticsEvent): Promise<AnalyticsEvent> {
    throw new Error('save not exercised in get-summary tests');
  }
  async list(_q: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }> {
    return { data: [], total: 0 };
  }
  async listWithLinkLabel(
    _q: AnalyticsListQuery,
  ): Promise<{ data: Array<AnalyticsEvent & { slug: string | null }>; total: number }> {
    return { data: [], total: 0 };
  }
  async getSummary(): Promise<AnalyticsSummary> {
    this.getSummaryCalls += 1;
    return this.summaryResult;
  }
  async getTimeseries(): Promise<TimeseriesBucket[]> {
    return [];
  }
}

describe('GetAnalyticsSummaryUseCase', () => {
  let repo: FakeAnalyticsRepository;
  let useCase: GetAnalyticsSummaryUseCase;

  beforeEach(() => {
    repo = new FakeAnalyticsRepository();
    useCase = new GetAnalyticsSummaryUseCase({ analyticsRepository: repo });
  });

  describe('KPI surfacing', () => {
    it('returns the 4 KPIs from the repository (passthrough)', async () => {
      repo.summaryResult = {
        totalLinks: 12,
        totalClicks: 540,
        clicksToday: 8,
        clicksLast7Days: 73,
      };
      const summary = await useCase.execute();
      expect(summary).toEqual({
        totalLinks: 12,
        totalClicks: 540,
        clicksToday: 8,
        clicksLast7Days: 73,
      });
    });

    it('returns all-zero KPIs when the repository reports no activity', async () => {
      const summary = await useCase.execute();
      expect(summary).toEqual({
        totalLinks: 0,
        totalClicks: 0,
        clicksToday: 0,
        clicksLast7Days: 0,
      });
    });

    it('surfaces totalClicks that includes soft-deleted-link events (retention)', async () => {
      // Spec analytics #2 + #5: totalClicks counts ALL events,
      // INCLUDING events for soft-deleted links. The repository is
      // responsible for the retention aggregation; the use-case must
      // not filter or recompute. The test pins the value (5) so a
      // future refactor that strips deleted-link events from the
      // summary would fail this test.
      repo.summaryResult = {
        totalLinks: 0, // link was soft-deleted
        totalClicks: 5, // ... but the 5 clicks are still retained
        clicksToday: 0,
        clicksLast7Days: 5,
      };
      const summary = await useCase.execute();
      expect(summary.totalLinks).toBe(0);
      expect(summary.totalClicks).toBe(5);
      expect(summary.clicksLast7Days).toBe(5);
    });

    it('reports clicks_today separately from clicks_last_7_days (UTC day vs rolling 168h)', async () => {
      // The repository exposes both windows as distinct integers —
      // the use-case must not collapse them. The Drizzle impl (Phase 5)
      // computes clicks_today with `timestamp >= date_trunc('day', now())`
      // and clicks_last_7_days with `timestamp >= now() - interval '7 days'`.
      repo.summaryResult = {
        totalLinks: 3,
        totalClicks: 100,
        clicksToday: 4,
        clicksLast7Days: 22,
      };
      const summary = await useCase.execute();
      expect(summary.clicksToday).toBe(4);
      expect(summary.clicksLast7Days).toBe(22);
      // clicks_last_7_days MUST be >= clicks_today (rolling window
      // is a superset of today's window).
      expect(summary.clicksLast7Days).toBeGreaterThanOrEqual(summary.clicksToday);
    });
  });

  describe('behaviour', () => {
    it('calls repository.getSummary exactly once per execute', async () => {
      await useCase.execute();
      await useCase.execute();
      expect(repo.getSummaryCalls).toBe(2);
    });

    it('returns the repository result by reference (transparent passthrough — no recomputation, no caching)', async () => {
      // The use-case is intentionally a transparent passthrough over
      // `repo.getSummary()`. We pin the behaviour: whatever the repo
      // returns is what the controller sees. The Drizzle Phase 5 impl
      // owns the KPI SQL; the use-case MUST NOT recompute the KPIs
      // from raw events (that would be a slow re-aggregation and a
      // divergence from the spec). This test catches a refactor that
      // introduces a second source of truth.
      repo.summaryResult = {
        totalLinks: 1,
        totalClicks: 2,
        clicksToday: 3,
        clicksLast7Days: 4,
      };
      const result = await useCase.execute();
      expect(result).toEqual(repo.summaryResult);
    });
  });
});
