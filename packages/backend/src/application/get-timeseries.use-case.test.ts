/**
 * Tests for `GetTimeseriesUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #4 (timeseries)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6 (sequence diagram)
 *
 * The use-case wraps `AnalyticsRepository.getTimeseries` and applies
 * the 30-day default range (per spec analytics #4: "When omitted, the
 * range MUST default to the last 30 days"). The clock is read via
 * `new Date()` — tests use `vi.setSystemTime` to pin `now` so the
 * 30-day window is deterministic.
 *
 * Granularity semantics live in the repository (the Drizzle Phase 5
 * impl uses Postgres `date_trunc('day'|'week'|'month', timestamp AT
 * TIME ZONE 'UTC')`); the use-case just forwards the granularity
 * enum and the resolved range.
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `get-timeseries.use-case.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { GetTimeseriesUseCase } from './get-timeseries.use-case.js';
import type {
  AnalyticsRepository,
  AnalyticsListQuery,
  AnalyticsSummary,
  TimeseriesBucket,
} from '../domain/repositories/analytics-repository.js';
import type { AnalyticsEvent } from '../domain/entities/analytics-event.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface GetTimeseriesCall {
  granularity: 'day' | 'week' | 'month';
  dateRange: { from: Date; to: Date };
}

class FakeAnalyticsRepository implements AnalyticsRepository {
  public buckets: TimeseriesBucket[] = [];
  public calls: GetTimeseriesCall[] = [];

  async save(_event: AnalyticsEvent): Promise<AnalyticsEvent> {
    throw new Error('save not exercised in get-timeseries tests');
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
    return { totalLinks: 0, totalClicks: 0, clicksToday: 0, clicksLast7Days: 0 };
  }
  async getTimeseries(
    granularity: 'day' | 'week' | 'month',
    dateRange: { from: Date; to: Date },
  ): Promise<TimeseriesBucket[]> {
    this.calls.push({ granularity, dateRange });
    return this.buckets;
  }
}

const FIXED_NOW = new Date('2026-07-04T12:00:00.000Z');
const EXPECTED_DEFAULT_FROM = new Date('2026-06-04T12:00:00.000Z'); // now - 30 days

describe('GetTimeseriesUseCase', () => {
  let repo: FakeAnalyticsRepository;
  let useCase: GetTimeseriesUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    repo = new FakeAnalyticsRepository();
    useCase = new GetTimeseriesUseCase({ analyticsRepository: repo });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('default range (spec analytics #4)', () => {
    it('defaults to [now-30d, now] when both dateFrom and dateTo are omitted', async () => {
      await useCase.execute({ granularity: 'day' });
      expect(repo.calls).toHaveLength(1);
      expect(repo.calls[0]!.granularity).toBe('day');
      expect(repo.calls[0]!.dateRange.from.toISOString()).toBe(EXPECTED_DEFAULT_FROM.toISOString());
      expect(repo.calls[0]!.dateRange.to.toISOString()).toBe(FIXED_NOW.toISOString());
    });

    it('defaults to to=now when only dateFrom is provided', async () => {
      const from = new Date('2026-01-01T00:00:00.000Z');
      await useCase.execute({ granularity: 'week', dateFrom: from });
      expect(repo.calls[0]!.dateRange.from).toEqual(from);
      expect(repo.calls[0]!.dateRange.to.toISOString()).toBe(FIXED_NOW.toISOString());
    });

    it('defaults to from=now-30d when only dateTo is provided', async () => {
      const to = new Date('2026-12-31T00:00:00.000Z');
      await useCase.execute({ granularity: 'month', dateTo: to });
      expect(repo.calls[0]!.dateRange.from.toISOString()).toBe(EXPECTED_DEFAULT_FROM.toISOString());
      expect(repo.calls[0]!.dateRange.to).toEqual(to);
    });
  });

  describe('granularity passthrough', () => {
    it('forwards granularity=day to the repository', async () => {
      await useCase.execute({ granularity: 'day' });
      expect(repo.calls[0]!.granularity).toBe('day');
    });

    it('forwards granularity=week to the repository', async () => {
      await useCase.execute({ granularity: 'week' });
      expect(repo.calls[0]!.granularity).toBe('week');
    });

    it('forwards granularity=month to the repository', async () => {
      await useCase.execute({ granularity: 'month' });
      expect(repo.calls[0]!.granularity).toBe('month');
    });
  });

  describe('explicit range', () => {
    it('forwards the exact dateFrom and dateTo when both are provided', async () => {
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-03-01T00:00:00.000Z');
      await useCase.execute({ granularity: 'day', dateFrom: from, dateTo: to });
      expect(repo.calls[0]!.dateRange).toEqual({ from, to });
    });
  });

  describe('output shape', () => {
    it('returns the buckets from the repository inside a `data` envelope', async () => {
      const buckets: TimeseriesBucket[] = [
        { bucketStart: new Date('2026-07-01T00:00:00.000Z'), count: 5 },
        { bucketStart: new Date('2026-07-02T00:00:00.000Z'), count: 3 },
        { bucketStart: new Date('2026-07-03T00:00:00.000Z'), count: 0 },
      ];
      repo.buckets = buckets;
      const result = await useCase.execute({ granularity: 'day' });
      expect(result.data).toEqual(buckets);
    });

    it('returns an empty data array when the repository has no buckets', async () => {
      const result = await useCase.execute({ granularity: 'day' });
      expect(result.data).toEqual([]);
    });
  });
});
