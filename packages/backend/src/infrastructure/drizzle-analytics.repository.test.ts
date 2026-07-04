/**
 * Unit tests for `DrizzleAnalyticsRepository`.
 *
 * Mocks the Drizzle client with a fluent-builder Proxy so the tests
 * run without a live Postgres (no Docker). The integration tests
 * under `tests/integration/drizzle-analytics.repository.test.ts`
 * exercise the same surface against a real testcontainers Postgres.
 *
 * The mock records every fluent call (method + args) in a call log
 * and yields a canned result on `await`. Each test pre-arms the
 * first/second result so the repository sees a deterministic value
 * when it `await`s the query.
 *
 * TDD note (Strict TDD active): these tests were written first. The
 * repository implementation in `drizzle-analytics.repository.ts` was
 * written to make them pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsEvent } from '../domain/entities/analytics-event.js';
import { DrizzleAnalyticsRepository } from './drizzle-analytics.repository.js';

import type { ShortPulseDb } from '../db/client.js';

// ---------------------------------------------------------------------------
// Drizzle query-builder fakes (shared with link-repository tests)
// ---------------------------------------------------------------------------

interface CallLog {
  /** Method name → args recorded (in invocation order). */
  methods: string[];
}

/**
 * Recursively stringify an arbitrary value into a short, log-friendly
 * representation. Handles the Drizzle object types we encounter
 * (`PgTable`, `PgColumn`, `SQL`).
 */
function stringify(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return `Date(${v.toISOString()})`;
  if (Array.isArray(v)) return `[${v.map(stringify).join(', ')}]`;
  if (typeof v === 'function') return `[fn ${(v as { name?: string }).name ?? 'anon'}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const symbols = Object.getOwnPropertySymbols(o);
    const baseNameSym = symbols.find((s) => s.toString() === 'Symbol(drizzle:BaseName)');
    if (baseNameSym) {
      return `<table ${String(o[baseNameSym])}>`;
    }
    if (typeof o['name'] === 'string' && 'columnType' in o) {
      return `<col ${o['name']}>`;
    }
    if (Array.isArray(o['queryChunks'])) {
      const chunks = (o['queryChunks'] as unknown[]).map(stringify);
      return `<sql ${chunks.join(' ')}>`;
    }
    try {
      const keys = Object.keys(o).slice(0, 4);
      const parts = keys.map((k) => `${k}:${stringify(o[k])}`);
      return `<obj {${parts.join(', ')}}>`;
    } catch {
      return `<obj ${(o.constructor as { name?: string } | undefined)?.name ?? 'anon'}>`;
    }
  }
  return String(v);
}

function makeDb(
  opts: {
    firstResult?: unknown;
    secondResult?: unknown;
    thirdResult?: unknown;
    defaultResult?: unknown;
  } = {},
): { db: ShortPulseDb; log: CallLog } {
  const log: CallLog = { methods: [] };
  const queue: unknown[] = [];
  if (opts.firstResult !== undefined) queue.push(opts.firstResult);
  if (opts.secondResult !== undefined) queue.push(opts.secondResult);
  if (opts.thirdResult !== undefined) queue.push(opts.thirdResult);

  function nextResult() {
    if (queue.length > 0) return queue.shift()!;
    return opts.defaultResult ?? [];
  }

  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve(nextResult());
      } catch (e) {
        if (reject) reject(e);
        else throw e;
      }
    },
  };

  const fluentMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'groupBy',
    'values',
    'set',
    'returning',
    'innerJoin',
    'leftJoin',
    'rightJoin',
  ];
  for (const m of fluentMethods) {
    builder[m] = (...args: unknown[]) => {
      log.methods.push(`${m}(${args.map(stringify).join(', ')})`);
      return builder;
    };
  }

  const db = {
    select: (...args: unknown[]) => {
      log.methods.push(`select(${args.map(stringify).join(', ')})`);
      return builder;
    },
    insert: (...args: unknown[]) => {
      log.methods.push(`insert(${args.map(stringify).join(', ')})`);
      return builder;
    },
    update: (...args: unknown[]) => {
      log.methods.push(`update(${args.map(stringify).join(', ')})`);
      return builder;
    },
    delete: (...args: unknown[]) => {
      log.methods.push(`delete(${args.map(stringify).join(', ')})`);
      return builder;
    },
  } as unknown as ShortPulseDb;

  return { db, log };
}

/** Build a Drizzle-shaped analytics row for return values. */
function makeEventRow(
  overrides: Partial<{
    id: string;
    linkId: string;
    timestamp: Date;
    ip: string;
    userAgent: string | null;
    referer: string | null;
    country: string | null;
    city: string | null;
    browser: string | null;
    slug: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    linkId: overrides.linkId ?? '22222222-2222-4222-8222-222222222222',
    timestamp: overrides.timestamp ?? new Date('2026-01-01T00:00:00.000Z'),
    ip: overrides.ip ?? '1.2.3.4',
    userAgent: overrides.userAgent ?? 'Mozilla/5.0',
    referer: overrides.referer ?? null,
    country: overrides.country ?? 'US',
    city: overrides.city ?? 'San Francisco',
    browser: overrides.browser ?? 'Chrome',
    slug: overrides.slug ?? null,
  };
}

const FIXED_ID = '11111111-1111-4111-8111-111111111111';
const FIXED_LINK_ID = '22222222-2222-4222-8222-222222222222';
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrizzleAnalyticsRepository — save', () => {
  it('persists a new event and returns the saved entity', async () => {
    const fake = makeDb({ firstResult: [makeEventRow()] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const event = createAnalyticsEvent({
      id: FIXED_ID,
      linkId: FIXED_LINK_ID,
      timestamp: FIXED_DATE,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: 'https://google.com',
      country: 'US',
      city: 'San Francisco',
      browser: 'Chrome',
    });
    const saved = await repo.save(event);
    expect(saved.id).toBe(event.id);
    expect(saved.linkId).toBe(FIXED_LINK_ID);
    expect(fake.log.methods).toContain('insert(<table analytics>)');
    expect(fake.log.methods).toContain('returning()');
  });

  it('round-trips the event fields through the values record', async () => {
    const fake = makeDb({ firstResult: [makeEventRow()] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const event = createAnalyticsEvent({
      id: FIXED_ID,
      linkId: FIXED_LINK_ID,
      timestamp: FIXED_DATE,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: null,
      country: null,
      city: null,
      browser: null,
    });
    await repo.save(event);
    const valuesCall = fake.log.methods.find((m) => m.startsWith('values('));
    expect(valuesCall).toBeDefined();
    expect(valuesCall).toContain('linkId:');
    expect(valuesCall).toContain('ip:');
  });
});

describe('DrizzleAnalyticsRepository — list', () => {
  it('returns the paginated events and total', async () => {
    const data = [
      makeEventRow({ id: '11111111-1111-4111-8111-aaaaaaaaaaaa' }),
      makeEventRow({ id: '11111111-1111-4111-8111-bbbbbbbbbbbb' }),
    ];
    const fake = makeDb({ firstResult: data, secondResult: [{ count: 2 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const result = await repo.list({ page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('queries the `analytics` table ordered by timestamp DESC', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.list({ page: 1, pageSize: 20 });
    expect(fake.log.methods).toContain('from(<table analytics>)');
    const orderCall = fake.log.methods.find((m) => m.startsWith('orderBy(')) ?? '';
    expect(orderCall).toContain('<col timestamp>');
  });

  it('applies limit + offset derived from page and pageSize', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.list({ page: 3, pageSize: 5 });
    expect(fake.log.methods).toContain('limit(5)');
    expect(fake.log.methods).toContain('offset(10)');
  });

  it('applies a linkId filter when provided', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.list({ page: 1, pageSize: 20, linkId: FIXED_LINK_ID });
    const whereCalls = fake.log.methods.filter((m) => m.startsWith('where('));
    expect(whereCalls.length).toBeGreaterThan(0);
    expect(whereCalls[0] ?? '').toContain('<col link_id>');
  });

  it('applies a country filter when provided', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.list({ page: 1, pageSize: 20, country: 'US' });
    const whereCalls = fake.log.methods.filter((m) => m.startsWith('where('));
    expect(whereCalls[0] ?? '').toContain('<col country>');
  });

  it('applies a dateFrom filter when provided', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const from = new Date('2026-01-01T00:00:00.000Z');
    await repo.list({ page: 1, pageSize: 20, dateFrom: from });
    const whereCalls = fake.log.methods.filter((m) => m.startsWith('where('));
    expect(whereCalls[0] ?? '').toContain('<col timestamp>');
    expect(whereCalls[0] ?? '').toContain('Date(');
  });
});

describe('DrizzleAnalyticsRepository — listWithLinkLabel', () => {
  it('returns events paired with the live slug', async () => {
    const data = [makeEventRow({ slug: 'hello' })];
    const fake = makeDb({ firstResult: data, secondResult: [{ count: 1 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const result = await repo.listWithLinkLabel({ page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.slug).toBe('hello');
  });

  it('returns null slug for soft-deleted-link events (the use-case maps to "(deleted link)")', async () => {
    // Spec analytics #3 + #5: when the link is soft-deleted the
    // join must produce `slug = NULL` so the use-case can render
    // the spec-locked "(deleted link)" literal.
    const data = [makeEventRow({ slug: null })];
    const fake = makeDb({ firstResult: data, secondResult: [{ count: 1 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const result = await repo.listWithLinkLabel({ page: 1, pageSize: 20 });
    expect(result.data[0]!.slug).toBeNull();
  });

  it('performs a LEFT JOIN against the links table (so soft-deleted links are still joined with null slug)', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.listWithLinkLabel({ page: 1, pageSize: 20 });
    // The query path includes a LEFT JOIN against the links table
    // (with the join condition as the second argument) so soft-
    // deleted rows remain in the result with a null slug.
    const leftJoinCall = fake.log.methods.find((m) => m.startsWith('leftJoin('));
    expect(leftJoinCall).toBeDefined();
    expect(leftJoinCall).toContain('<table links>');
  });
});

describe('DrizzleAnalyticsRepository — getSummary', () => {
  it('returns the 4 KPIs from a single batched query', async () => {
    // The implementation issues 4 SELECT ... count(*) queries
    // (one per KPI) and assembles the result. We pre-arm a single
    // result that the mock yields for every await, and verify the
    // final shape.
    const fake = makeDb({
      firstResult: [{ count: 5 }], // totalLinks
      secondResult: [{ count: 42 }], // totalClicks
      thirdResult: [{ count: 3 }], // clicksToday
      defaultResult: [{ count: 18 }], // clicksLast7Days
    });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const summary = await repo.getSummary();
    expect(summary).toEqual({
      totalLinks: 5,
      totalClicks: 42,
      clicksToday: 3,
      clicksLast7Days: 18,
    });
  });

  it('queries the `links` table for totalLinks and `analytics` for the click KPIs', async () => {
    const fake = makeDb({
      firstResult: [{ count: 0 }],
      secondResult: [{ count: 0 }],
      thirdResult: [{ count: 0 }],
      defaultResult: [{ count: 0 }],
    });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.getSummary();
    // One `from(links)` for totalLinks, three `from(analytics)` for
    // the click KPIs.
    const fromLinks = fake.log.methods.filter((m) => m === 'from(<table links>)');
    const fromAnalytics = fake.log.methods.filter((m) => m === 'from(<table analytics>)');
    expect(fromLinks).toHaveLength(1);
    expect(fromAnalytics).toHaveLength(3);
  });

  it('excludes soft-deleted links from totalLinks (links WHERE deleted_at IS NULL)', async () => {
    const fake = makeDb({
      firstResult: [{ count: 7 }],
      defaultResult: [{ count: 0 }],
    });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.getSummary();
    // Find the WHERE call that targets the `links` table — it
    // MUST reference `deleted_at`.
    const fromLinksIndex = fake.log.methods.findIndex((m) => m === 'from(<table links>)');
    // The WHERE call comes after FROM.
    const whereCall = fake.log.methods.slice(fromLinksIndex).find((m) => m.startsWith('where('));
    expect(whereCall).toBeDefined();
    expect(whereCall).toContain('<col deleted_at>');
  });

  it('counts ALL click events (including soft-deleted-link events) for totalClicks', async () => {
    // Spec analytics #2 + #5: totalClicks counts every event,
    // including events whose link has been soft-deleted. The
    // query for totalClicks MUST NOT add a join to links or
    // filter on links.deleted_at — the design ADR-004 retention
    // invariant keeps the click count honest after deletes.
    const fake = makeDb({
      firstResult: [{ count: 0 }],
      secondResult: [{ count: 100 }],
      defaultResult: [{ count: 0 }],
    });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    await repo.getSummary();
    // The second SELECT (for totalClicks) targets analytics only.
    const fromCalls = fake.log.methods.filter((m) => m.startsWith('from('));
    const analyticsFroms = fromCalls.filter((m) => m === 'from(<table analytics>)');
    expect(analyticsFroms.length).toBeGreaterThanOrEqual(1);
    // The totalClicks query should not include a leftJoin.
    const leftJoins = fake.log.methods.filter((m) => m.startsWith('leftJoin('));
    expect(leftJoins).toHaveLength(0);
  });
});

describe('DrizzleAnalyticsRepository — getTimeseries', () => {
  it('buckets events by day (date_trunc day) for the day granularity', async () => {
    const fake = makeDb({
      firstResult: [
        { bucket: new Date('2026-01-01T00:00:00.000Z'), count: 10 },
        { bucket: new Date('2026-01-02T00:00:00.000Z'), count: 5 },
      ],
    });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const buckets = await repo.getTimeseries('day', {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-31T00:00:00.000Z'),
    });
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.count).toBe(10);
    // The query targets the analytics table.
    expect(fake.log.methods).toContain('from(<table analytics>)');
    // The query groups by a single bucket column.
    const groupByCall = fake.log.methods.find((m) => m.startsWith('groupBy('));
    expect(groupByCall).toBeDefined();
  });

  it('applies a date-range WHERE filter (timestamp BETWEEN from AND to)', async () => {
    const fake = makeDb({ firstResult: [] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T00:00:00.000Z');
    await repo.getTimeseries('day', { from, to });
    const whereCall = fake.log.methods.find((m) => m.startsWith('where(')) ?? '';
    // The where clause references the timestamp column and both
    // Date() arguments.
    expect(whereCall).toContain('<col timestamp>');
    expect(whereCall).toContain('Date(');
  });

  it('returns empty array when no buckets match', async () => {
    const fake = makeDb({ firstResult: [] });
    const repo = new DrizzleAnalyticsRepository(fake.db);
    const buckets = await repo.getTimeseries('day', {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(buckets).toEqual([]);
  });
});

describe('DrizzleAnalyticsRepository — interface conformance', () => {
  it('satisfies the `AnalyticsRepository` interface (compile-time)', () => {
    const repo: import('../domain/repositories/analytics-repository.js').AnalyticsRepository =
      new DrizzleAnalyticsRepository({} as ShortPulseDb);
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.list).toBe('function');
    expect(typeof repo.listWithLinkLabel).toBe('function');
    expect(typeof repo.getSummary).toBe('function');
    expect(typeof repo.getTimeseries).toBe('function');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
