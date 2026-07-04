/**
 * Tests for the repository + port interfaces.
 *
 * These are interface contracts — the production code in Phase 5
 * (infrastructure) implements them. The test verifies the contract
 * is well-typed by writing mock implementations that:
 *  - compile against the interface (TypeScript catches missing
 *    methods / wrong signatures);
 *  - run against the entity / value-object types they receive and
 *    return (so the contract actually flows through at runtime).
 *
 * Mock implementations are colocated in this file rather than in a
 * shared fixture — the goal is to document the contract, not to
 * produce reusable test doubles (Phase 5 will do that).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import type { Link } from './entities/link.js';
import type { AnalyticsEvent } from './entities/analytics-event.js';
import type { LinkRepository, ListLinksQuery } from './repositories/link-repository.js';
import type {
  AnalyticsRepository,
  AnalyticsListQuery,
  AnalyticsSummary,
  TimeseriesBucket,
  TimeseriesQuery,
} from './repositories/analytics-repository.js';
import type { Geolocator } from './ports/geolocator.js';
import type { UaParser } from './ports/ua-parser.js';
import type { RandomBytes } from './ports/random-bytes.js';
import { createLink } from './entities/link.js';
import { createAnalyticsEvent } from './entities/analytics-event.js';
import { generateSlug } from './value-objects/slug.js';

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');
const LINK_ID = '11111111-1111-4111-8111-111111111111';
const VALID_URL = 'https://example.com/';

// ---------------------------------------------------------------------------
// Mock implementations — verify the interface is consumable
// ---------------------------------------------------------------------------

class InMemoryLinkRepository implements LinkRepository {
  private store: Link[] = [];

  async findById(id: string): Promise<Link | null> {
    return this.store.find((l) => l.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Link | null> {
    return this.store.find((l) => l.slug === slug && !l.isDeleted()) ?? null;
  }

  async save(link: Link): Promise<Link> {
    this.store.push(link);
    return link;
  }

  async softDelete(id: string): Promise<void> {
    const idx = this.store.findIndex((l) => l.id === id);
    if (idx >= 0) {
      const deleted = this.store[idx]!.softDelete();
      this.store[idx] = deleted;
    }
  }

  async list(query: ListLinksQuery): Promise<{ data: Link[]; total: number }> {
    const filtered = this.store.filter((l) => !l.isDeleted());
    const start = (query.page - 1) * query.pageSize;
    return {
      data: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
    };
  }

  async countClicksByLink(_linkId: string): Promise<number> {
    return 0;
  }
}

class InMemoryAnalyticsRepository implements AnalyticsRepository {
  private events: AnalyticsEvent[] = [];

  async save(event: AnalyticsEvent): Promise<AnalyticsEvent> {
    this.events.push(event);
    return event;
  }

  async list(query: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }> {
    const start = (query.page - 1) * query.pageSize;
    return {
      data: this.events.slice(start, start + query.pageSize),
      total: this.events.length,
    };
  }

  async getSummary(): Promise<AnalyticsSummary> {
    return {
      totalLinks: 0,
      totalClicks: this.events.length,
      clicksToday: 0,
      clicksLast7Days: 0,
    };
  }

  async getTimeseries(
    _granularity: 'day' | 'week' | 'month',
    _dateRange: { from: Date; to: Date },
    _linkId?: string,
  ): Promise<TimeseriesBucket[]> {
    return [];
  }

  async listWithLinkLabel(
    query: AnalyticsListQuery,
  ): Promise<{ data: Array<AnalyticsEvent & { slug: string | null }>; total: number }> {
    const start = (query.page - 1) * query.pageSize;
    return {
      // The in-memory mock has no link table to join against, so
      // `slug` is always `null` (which the use-case maps to
      // "(deleted link)"). The Drizzle Phase 5 impl will fill this
      // with the real slug or `null` for soft-deleted rows.
      data: this.events.slice(start, start + query.pageSize).map((e) => ({ ...e, slug: null })),
      total: this.events.length,
    };
  }
}

class StaticGeolocator implements Geolocator {
  constructor(private readonly result: { country: string | null; city: string | null }) {}
  lookup(_ip: string): { country: string | null; city: string | null } {
    return this.result;
  }
}

class StaticUaParser implements UaParser {
  constructor(private readonly result: { browser: string | null }) {}
  parse(_userAgent: string): { browser: string | null } {
    return this.result;
  }
}

class FixedRandomBytes implements RandomBytes {
  constructor(private readonly bytes: Buffer) {}
  randomBytes(size: number): Buffer {
    if (size === 0) return Buffer.alloc(0);
    // Repeat the seed to satisfy the requested size — fine for tests.
    const out = Buffer.alloc(size);
    for (let i = 0; i < size; i += 1) {
      out[i] = this.bytes[i % this.bytes.length]!;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// LinkRepository
// ---------------------------------------------------------------------------

describe('LinkRepository contract (via InMemoryLinkRepository)', () => {
  let repo: InMemoryLinkRepository;

  beforeEach(() => {
    repo = new InMemoryLinkRepository();
  });

  it('save + findById returns the same entity', async () => {
    const link = createLink({
      id: LINK_ID,
      originalUrl: VALID_URL,
      slug: 'my-link',
      createdAt: FIXED_DATE,
    });
    await repo.save(link);
    const found = await repo.findById(LINK_ID);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(LINK_ID);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('99999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('findBySlug returns the active (non-deleted) link', async () => {
    const link = createLink({
      id: LINK_ID,
      originalUrl: VALID_URL,
      slug: 'my-link',
      createdAt: FIXED_DATE,
    });
    await repo.save(link);
    const found = await repo.findBySlug('my-link');
    expect(found?.id).toBe(LINK_ID);
  });

  it('findBySlug returns null for a soft-deleted link', async () => {
    const link = createLink({
      id: LINK_ID,
      originalUrl: VALID_URL,
      slug: 'my-link',
      createdAt: FIXED_DATE,
    });
    await repo.save(link);
    await repo.softDelete(LINK_ID);
    expect(await repo.findBySlug('my-link')).toBeNull();
  });

  it('softDelete is idempotent (calling twice is safe)', async () => {
    const link = createLink({
      id: LINK_ID,
      originalUrl: VALID_URL,
      slug: 'my-link',
      createdAt: FIXED_DATE,
    });
    await repo.save(link);
    await repo.softDelete(LINK_ID);
    await repo.softDelete(LINK_ID); // second call must not throw
    expect(await repo.findBySlug('my-link')).toBeNull();
  });

  it('list paginates and returns total', async () => {
    // Insert 5 links
    for (let i = 0; i < 5; i += 1) {
      const l = createLink({
        id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
        originalUrl: VALID_URL,
        slug: `link-${i}`,
        createdAt: FIXED_DATE,
      });
      await repo.save(l);
    }
    const page1 = await repo.list({ page: 1, pageSize: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    const page3 = await repo.list({ page: 3, pageSize: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('list excludes soft-deleted links from both data and total', async () => {
    for (let i = 0; i < 3; i += 1) {
      const l = createLink({
        id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
        originalUrl: VALID_URL,
        slug: `link-${i}`,
        createdAt: FIXED_DATE,
      });
      await repo.save(l);
    }
    await repo.softDelete('11111111-1111-4111-8111-000000000001');
    const result = await repo.list({ page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('countClicksByLink returns a number (per-link click count)', async () => {
    const count = await repo.countClicksByLink(LINK_ID);
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// AnalyticsRepository
// ---------------------------------------------------------------------------

describe('AnalyticsRepository contract (via InMemoryAnalyticsRepository)', () => {
  let repo: InMemoryAnalyticsRepository;

  beforeEach(() => {
    repo = new InMemoryAnalyticsRepository();
  });

  it('save + list round-trip preserves the event', async () => {
    const event = createAnalyticsEvent({
      id: '11111111-1111-4111-8111-111111111111',
      linkId: LINK_ID,
      timestamp: FIXED_DATE,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: 'https://google.com',
      country: 'US',
      city: 'San Francisco',
      browser: 'Chrome',
    });
    await repo.save(event);
    const result = await repo.list({ page: 1, pageSize: 10 });
    expect(result.data[0]!.id).toBe(event.id);
  });

  it('getSummary returns the 4 KPIs with non-negative integers', async () => {
    const summary = await repo.getSummary();
    expect(typeof summary.totalLinks).toBe('number');
    expect(typeof summary.totalClicks).toBe('number');
    expect(typeof summary.clicksToday).toBe('number');
    expect(typeof summary.clicksLast7Days).toBe('number');
    for (const v of Object.values(summary)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('getTimeseries accepts the 3 spec granularities', async () => {
    const range = { from: FIXED_DATE, to: new Date('2026-12-31T00:00:00.000Z') };
    const q: TimeseriesQuery = { granularity: 'day', dateRange: range };
    const buckets: TimeseriesBucket[] = await repo.getTimeseries(q.granularity, q.dateRange);
    expect(Array.isArray(buckets)).toBe(true);
  });

  it('listWithLinkLabel returns events paired with their slug (or null when deleted)', async () => {
    // Spec analytics #3 + #5: events list shows slug OR "(deleted link)"
    // for soft-deleted links. The Drizzle impl (Phase 5) does a
    // LEFT JOIN ... COALESCE(slug, NULL) — the interface surfaces the
    // raw `slug: string | null` so the application-layer use-case can
    // own the spec-locked "(deleted link)" literal (obs #7).
    //
    // `typedRepo` is bound to the `AnalyticsRepository` INTERFACE so
    // this test only passes if the interface declares
    // `listWithLinkLabel` — the mock's runtime class can have any
    // shape, but a caller that consumes only the interface will fail
    // to compile without the method.
    const typedRepo: AnalyticsRepository = repo;
    const live = createAnalyticsEvent({
      id: '11111111-1111-4111-8111-aaaaaaaaaaaa',
      linkId: LINK_ID,
      timestamp: FIXED_DATE,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: null,
      country: 'US',
      city: 'San Francisco',
      browser: 'Chrome',
    });
    await typedRepo.save(live);
    const result = await typedRepo.listWithLinkLabel({ page: 1, pageSize: 10 });
    expect(result.data).toHaveLength(1);
    // `slug` is the join field — `null` for the in-memory mock (the
    // mock has no link table to join against). The Phase 5 Drizzle
    // impl will populate this with the real slug or `null` for
    // soft-deleted rows.
    expect(result.data[0]).toMatchObject({
      id: live.id,
      linkId: LINK_ID,
    });
    expect(result.data[0]!.slug).toBeNull();
  });

  it('listWithLinkLabel supports the same query shape as list (linkId / dateFrom / dateTo / country / page / pageSize)', async () => {
    // The application layer forwards the same AnalyticsListQuery to
    // both methods — the contract test confirms the new method
    // accepts the full query type, not a subset. The interface-typed
    // reference enforces this.
    const typedRepo: AnalyticsRepository = repo;
    const result = await typedRepo.listWithLinkLabel({
      page: 2,
      pageSize: 5,
      linkId: LINK_ID,
      dateFrom: FIXED_DATE,
      dateTo: new Date('2026-12-31T00:00:00.000Z'),
      country: 'US',
    });
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Geolocator port
// ---------------------------------------------------------------------------

describe('Geolocator port (via StaticGeolocator)', () => {
  it('lookup returns the configured geo pair', () => {
    const g = new StaticGeolocator({ country: 'US', city: 'San Francisco' });
    expect(g.lookup('1.2.3.4')).toEqual({ country: 'US', city: 'San Francisco' });
  });

  it('lookup returns nulls when the database misses (degraded mode)', () => {
    const g = new StaticGeolocator({ country: null, city: null });
    expect(g.lookup('0.0.0.0')).toEqual({ country: null, city: null });
  });
});

// ---------------------------------------------------------------------------
// UaParser port
// ---------------------------------------------------------------------------

describe('UaParser port (via StaticUaParser)', () => {
  it('parse returns the configured browser', () => {
    const p = new StaticUaParser({ browser: 'Chrome' });
    expect(p.parse('Mozilla/5.0 ... Chrome/120')).toEqual({ browser: 'Chrome' });
  });

  it('parse returns null when the UA is unrecognized', () => {
    const p = new StaticUaParser({ browser: null });
    expect(p.parse('garbage')).toEqual({ browser: null });
  });
});

// ---------------------------------------------------------------------------
// RandomBytes port
// ---------------------------------------------------------------------------

describe('RandomBytes port (via FixedRandomBytes)', () => {
  it('returns a Buffer of the requested size', () => {
    const r = new FixedRandomBytes(Buffer.from([0x10, 0x20, 0x30]));
    const buf = r.randomBytes(8);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf).toHaveLength(8);
  });

  it('returns an empty Buffer for size 0', () => {
    const r = new FixedRandomBytes(Buffer.from([0x10]));
    expect(r.randomBytes(0)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Domain-purity cross-check: interfaces only depend on the domain types
// ---------------------------------------------------------------------------

describe('Domain layer purity', () => {
  it('a Slug value object is a valid argument for repository methods (string at runtime)', () => {
    // The Slug value object is `string & { __slug: ... }` at the type
    // level. At runtime it is a plain string — so it can be passed
    // wherever a string is expected. This proves the brand does not
    // leak into repository implementations.
    const slug = generateSlug();
    const repo = new InMemoryLinkRepository();
    // findBySlug takes a string; passing a Slug must work (the brand
    // is structural, not nominal, and the type widens to string).
    return expect(repo.findBySlug(slug)).resolves.toBeNull();
  });
});
