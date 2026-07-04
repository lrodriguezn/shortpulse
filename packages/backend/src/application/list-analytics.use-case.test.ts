/**
 * Tests for `ListAnalyticsUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #3 (events query),
 *    #5 (retention after soft-delete)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 *
 * The use-case composes `AnalyticsRepository.listWithLinkLabel` (added
 * in this slice) and maps the raw `slug: string | null` per event to a
 * presentation DTO `linkLabel: string`:
 *  - `slug !== null` → `linkLabel = slug`
 *  - `slug === null` → `linkLabel = "(deleted link)"`  ← spec-locked literal
 *
 * The literal lives in the use-case (not the repository) so the
 * rendering is testable at the application boundary without touching
 * SQL. The Phase 5 Drizzle impl will `LEFT JOIN` the link table and
 * return `null` for soft-deleted rows.
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `list-analytics.use-case.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { ListAnalyticsUseCase } from './list-analytics.use-case.js';
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

interface ListWithLinkLabelCall {
  query: AnalyticsListQuery;
}

class FakeAnalyticsRepository implements AnalyticsRepository {
  public rows: Array<AnalyticsEvent & { slug: string | null }> = [];
  public total = 0;
  public listWithLinkLabelCalls: ListWithLinkLabelCall[] = [];

  async save(_event: AnalyticsEvent): Promise<AnalyticsEvent> {
    throw new Error('save not exercised in list-analytics tests');
  }
  async list(_q: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }> {
    return { data: [], total: 0 };
  }
  async listWithLinkLabel(
    query: AnalyticsListQuery,
  ): Promise<{ data: Array<AnalyticsEvent & { slug: string | null }>; total: number }> {
    this.listWithLinkLabelCalls.push({ query });
    const start = (query.page - 1) * query.pageSize;
    return {
      data: this.rows.slice(start, start + query.pageSize),
      total: this.total,
    };
  }
  async getSummary(): Promise<AnalyticsSummary> {
    return { totalLinks: 0, totalClicks: 0, clicksToday: 0, clicksLast7Days: 0 };
  }
  async getTimeseries(): Promise<TimeseriesBucket[]> {
    return [];
  }
}

const FIXED_TS = new Date('2026-05-01T12:00:00.000Z');
const LINK_ID_1 = '11111111-1111-4111-8111-111111111111';
const LINK_ID_2 = '22222222-2222-4222-8222-222222222222';

function makeEvent(
  id: string,
  linkId: string,
  overrides: Partial<AnalyticsEvent> = {},
): AnalyticsEvent {
  return {
    id,
    linkId,
    timestamp: FIXED_TS,
    ip: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    referer: null,
    country: 'US',
    city: 'San Francisco',
    browser: 'Chrome',
    ...overrides,
  };
}

describe('ListAnalyticsUseCase', () => {
  let repo: FakeAnalyticsRepository;
  let useCase: ListAnalyticsUseCase;

  beforeEach(() => {
    repo = new FakeAnalyticsRepository();
    useCase = new ListAnalyticsUseCase({ analyticsRepository: repo });
  });

  describe('happy path', () => {
    it('returns paginated events with the 4 spec envelope fields (data, total, page, pageSize)', async () => {
      for (let i = 0; i < 5; i += 1) {
        repo.rows.push({ ...makeEvent(`e-${i}`, LINK_ID_1), slug: 'live' });
      }
      repo.total = 5;
      const result = await useCase.execute({ page: 1, pageSize: 3 });
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(3);
    });

    it('returns an empty page when the repository has no rows', async () => {
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('(deleted link) rendering seam (spec analytics #3 + #5)', () => {
    it('renders "(deleted link)" when the repository returns slug=null for the event', async () => {
      // Spec-locked literal: events for soft-deleted links MUST
      // render as "(deleted link)" in the API response. The repo
      // signals this with slug=null (the Drizzle impl does a LEFT JOIN
      // that produces NULL for soft-deleted links); the use-case
      // owns the literal so the spec contract is testable here.
      repo.rows = [
        { ...makeEvent('e-1', LINK_ID_1), slug: null },
        { ...makeEvent('e-2', LINK_ID_2), slug: 'live' },
      ];
      repo.total = 2;
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      expect(result.data[0]!.linkLabel).toBe('(deleted link)');
      expect(result.data[1]!.linkLabel).toBe('live');
    });

    it('renders the live slug when the link is active (slug is a non-null string)', async () => {
      repo.rows = [
        { ...makeEvent('e-1', LINK_ID_1), slug: 'github' },
        { ...makeEvent('e-2', LINK_ID_2), slug: 'docs' },
      ];
      repo.total = 2;
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      expect(result.data[0]!.linkLabel).toBe('github');
      expect(result.data[1]!.linkLabel).toBe('docs');
    });

    it('preserves the underlying AnalyticsEvent fields alongside linkLabel', async () => {
      // The presentation DTO is `AnalyticsEvent & { linkLabel: string }`
      // — the event payload (id, linkId, timestamp, ip, userAgent,
      // referer, country, city, browser) is NOT dropped, only
      // enriched. The controller composes the snake_case response
      // from the camelCase event fields directly.
      const event = makeEvent('e-1', LINK_ID_1, { country: 'AR', city: 'Buenos Aires' });
      repo.rows = [{ ...event, slug: 'live' }];
      repo.total = 1;
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      const row = result.data[0]!;
      expect(row.id).toBe(event.id);
      expect(row.linkId).toBe(event.linkId);
      expect(row.timestamp).toEqual(event.timestamp);
      expect(row.ip).toBe(event.ip);
      expect(row.country).toBe('AR');
      expect(row.city).toBe('Buenos Aires');
      expect(row.linkLabel).toBe('live');
    });
  });

  describe('query forwarding', () => {
    it('forwards linkId, dateFrom, dateTo, country, page, pageSize to the repository', async () => {
      const dateFrom = new Date('2026-01-01T00:00:00.000Z');
      const dateTo = new Date('2026-12-31T00:00:00.000Z');
      await useCase.execute({
        page: 2,
        pageSize: 5,
        linkId: LINK_ID_1,
        dateFrom,
        dateTo,
        country: 'US',
      });
      expect(repo.listWithLinkLabelCalls).toHaveLength(1);
      expect(repo.listWithLinkLabelCalls[0]!.query).toEqual({
        page: 2,
        pageSize: 5,
        linkId: LINK_ID_1,
        dateFrom,
        dateTo,
        country: 'US',
      });
    });

    it('omits optional filters when not provided (does not forward undefined fields)', async () => {
      await useCase.execute({ page: 1, pageSize: 20 });
      expect(repo.listWithLinkLabelCalls[0]!.query).toEqual({ page: 1, pageSize: 20 });
    });
  });
});
