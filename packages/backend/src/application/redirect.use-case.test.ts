/**
 * Tests for `RedirectUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #4 (redirect), #5 (analytics)
 *  - `openspec/changes/add-shortpulse-app/design.md` §6 (redirect flow)
 *
 * The use-case composes:
 *  - `LinkRepository.findBySlug` (case-insensitive per design §4) →
 *    `LinkNotFoundError` (404) on miss or deleted
 *  - `Geolocator.lookup(ip)` → `{country, city}`
 *  - `UaParser.parse(userAgent)` → `{browser}`
 *  - `createAnalyticsEvent` (domain entity)
 *  - `AnalyticsRepository.save` (sync, per ADR-002)
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `redirect.use-case.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { RedirectUseCase } from './redirect.use-case.js';
import { LinkNotFoundError } from '../domain/errors.js';
import { createLink } from '../domain/entities/link.js';
import type { Link } from '../domain/entities/link.js';
import type { AnalyticsEvent } from '../domain/entities/analytics-event.js';
import type { LinkRepository } from '../domain/repositories/link-repository.js';
import type { AnalyticsRepository } from '../domain/repositories/analytics-repository.js';
import type { Geolocator, GeoLookupResult } from '../domain/ports/geolocator.js';
import type { UaParser, UaParseResult } from '../domain/ports/ua-parser.js';
import type {
  AnalyticsListQuery,
  AnalyticsSummary,
  TimeseriesBucket,
} from '../domain/repositories/analytics-repository.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class InMemoryLinkRepository implements LinkRepository {
  private store: Link[] = [];
  async findById(id: string): Promise<Link | null> {
    return this.store.find((l) => l.id === id) ?? null;
  }
  async findBySlug(slug: string): Promise<Link | null> {
    const target = slug.toLowerCase();
    return this.store.find((l) => l.slug === target && !l.isDeleted()) ?? null;
  }
  async save(link: Link): Promise<Link> {
    this.store.push(link);
    return link;
  }
  async softDelete(id: string): Promise<void> {
    const idx = this.store.findIndex((l) => l.id === id);
    if (idx >= 0) {
      this.store[idx] = this.store[idx]!.softDelete();
    }
  }
  async list(): Promise<{ data: Link[]; total: number }> {
    const active = this.store.filter((l) => !l.isDeleted());
    return { data: active, total: active.length };
  }
  async countClicksByLink(): Promise<number> {
    return 0;
  }
}

class RecordingAnalyticsRepository implements AnalyticsRepository {
  public saved: AnalyticsEvent[] = [];
  async save(event: AnalyticsEvent): Promise<AnalyticsEvent> {
    this.saved.push(event);
    return event;
  }
  async list(_q: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }> {
    return { data: this.saved, total: this.saved.length };
  }
  async getSummary(): Promise<AnalyticsSummary> {
    return { totalLinks: 0, totalClicks: 0, clicksToday: 0, clicksLast7Days: 0 };
  }
  async getTimeseries(): Promise<TimeseriesBucket[]> {
    return [];
  }
  async listWithLinkLabel(
    _q: AnalyticsListQuery,
  ): Promise<{ data: Array<AnalyticsEvent & { slug: string | null }>; total: number }> {
    return {
      data: this.saved.map((e) => ({ ...e, slug: null })),
      total: this.saved.length,
    };
  }
}

class StaticGeolocator implements Geolocator {
  constructor(private readonly result: GeoLookupResult) {}
  lookup(_ip: string): GeoLookupResult {
    return this.result;
  }
}

class StaticUaParser implements UaParser {
  constructor(private readonly result: UaParseResult) {}
  parse(_ua: string): UaParseResult {
    return this.result;
  }
}

const FIXED_ID = '11111111-1111-4111-8111-111111111111';
const VALID_URL = 'https://example.com/landing';
const DEFAULT_GEO: GeoLookupResult = { country: 'US', city: 'San Francisco' };
const DEFAULT_UA: UaParseResult = { browser: 'Chrome' };

describe('RedirectUseCase', () => {
  let links: InMemoryLinkRepository;
  let analytics: RecordingAnalyticsRepository;
  let geo: StaticGeolocator;
  let ua: StaticUaParser;
  let useCase: RedirectUseCase;

  beforeEach(() => {
    links = new InMemoryLinkRepository();
    analytics = new RecordingAnalyticsRepository();
    geo = new StaticGeolocator(DEFAULT_GEO);
    ua = new StaticUaParser(DEFAULT_UA);
    useCase = new RedirectUseCase({
      linkRepository: links,
      analyticsRepository: analytics,
      geolocator: geo,
      uaParser: ua,
    });
  });

  describe('happy path', () => {
    it('returns the originalUrl for a known active slug', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      const result = await useCase.execute({
        slug: 'abc',
        ip: '203.0.113.1',
        userAgent: 'Mozilla/5.0',
        referer: 'https://google.com',
      });

      expect(result.originalUrl).toBe(VALID_URL);
    });

    it('matches the slug case-insensitively (storage lowercased per design §4)', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'mixed',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      const result = await useCase.execute({
        slug: 'MIXED',
        ip: '203.0.113.1',
        userAgent: null,
        referer: null,
      });
      expect(result.originalUrl).toBe(VALID_URL);
    });

    it('records exactly one analytics event with the correct fields', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      await useCase.execute({
        slug: 'abc',
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (Macintosh)',
        referer: 'https://news.ycombinator.com',
      });

      expect(analytics.saved).toHaveLength(1);
      const event = analytics.saved[0]!;
      expect(event.linkId).toBe(FIXED_ID);
      expect(event.ip).toBe('203.0.113.7');
      expect(event.userAgent).toBe('Mozilla/5.0 (Macintosh)');
      expect(event.referer).toBe('https://news.ycombinator.com');
      expect(event.country).toBe('US');
      expect(event.city).toBe('San Francisco');
      expect(event.browser).toBe('Chrome');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('records geo from the Geolocator port (port composed over the request IP)', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      const capturingGeo: Geolocator = {
        lookup: (ip: string) => {
          expect(ip).toBe('198.51.100.42');
          return { country: 'AR', city: 'Buenos Aires' };
        },
      };
      const uc = new RedirectUseCase({
        linkRepository: links,
        analyticsRepository: analytics,
        geolocator: capturingGeo,
        uaParser: ua,
      });

      await uc.execute({
        slug: 'abc',
        ip: '198.51.100.42',
        userAgent: 'curl/8.0',
        referer: null,
      });

      expect(analytics.saved[0]!.country).toBe('AR');
      expect(analytics.saved[0]!.city).toBe('Buenos Aires');
    });

    it('records browser from the UaParser port (port composed over the request UA)', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      const capturingUa: UaParser = {
        parse: (uaStr: string) => {
          expect(uaStr).toBe('Mozilla/5.0 (X11; Linux x86_64) Firefox/130');
          return { browser: 'Firefox' };
        },
      };
      const uc = new RedirectUseCase({
        linkRepository: links,
        analyticsRepository: analytics,
        geolocator: geo,
        uaParser: capturingUa,
      });

      await uc.execute({
        slug: 'abc',
        ip: '203.0.113.99',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130',
        referer: null,
      });

      expect(analytics.saved[0]!.browser).toBe('Firefox');
    });
  });

  describe('null / missing request fields', () => {
    it('records userAgent=null when the request has no UA header', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      await useCase.execute({
        slug: 'abc',
        ip: '203.0.113.1',
        userAgent: null,
        referer: null,
      });
      expect(analytics.saved[0]!.userAgent).toBeNull();
      // The UA parser must NOT be called with null — that's a contract
      // mismatch and the port should not be invoked at all.
      // We don't track calls here, but the recorded browser will fall
      // through to null since the port received a non-call.
    });

    it('records referer=null when the request has no Referer header', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      await useCase.execute({
        slug: 'abc',
        ip: '203.0.113.1',
        userAgent: 'curl/8.0',
        referer: null,
      });
      expect(analytics.saved[0]!.referer).toBeNull();
    });

    it('records geo + browser as null when the ports return nulls (degraded mode)', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'abc',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      const blankGeo = new StaticGeolocator({ country: null, city: null });
      const blankUa = new StaticUaParser({ browser: null });
      const uc = new RedirectUseCase({
        linkRepository: links,
        analyticsRepository: analytics,
        geolocator: blankGeo,
        uaParser: blankUa,
      });

      await uc.execute({
        slug: 'abc',
        ip: '127.0.0.1',
        userAgent: 'unknown',
        referer: null,
      });

      expect(analytics.saved[0]!.country).toBeNull();
      expect(analytics.saved[0]!.city).toBeNull();
      expect(analytics.saved[0]!.browser).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws LinkNotFoundError (404) when the slug does not exist', async () => {
      await expect(
        useCase.execute({
          slug: 'ghost',
          ip: '203.0.113.1',
          userAgent: 'curl/8.0',
          referer: null,
        }),
      ).rejects.toBeInstanceOf(LinkNotFoundError);
    });

    it('throws LinkNotFoundError (404) when the slug is soft-deleted', async () => {
      const deletedLink = createLink({
        id: FIXED_ID,
        originalUrl: VALID_URL,
        slug: 'gone',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await links.save(deletedLink);
      await links.softDelete(FIXED_ID);

      await expect(
        useCase.execute({
          slug: 'gone',
          ip: '203.0.113.1',
          userAgent: 'curl/8.0',
          referer: null,
        }),
      ).rejects.toBeInstanceOf(LinkNotFoundError);
    });

    it('does NOT record an analytics event when the slug is not found (no event orphaning)', async () => {
      await expect(
        useCase.execute({
          slug: 'ghost',
          ip: '203.0.113.1',
          userAgent: 'curl/8.0',
          referer: null,
        }),
      ).rejects.toBeInstanceOf(LinkNotFoundError);
      expect(analytics.saved).toHaveLength(0);
    });

    it('does NOT record an analytics event when the slug is soft-deleted', async () => {
      await links.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'gone',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      await links.softDelete(FIXED_ID);

      await expect(
        useCase.execute({
          slug: 'gone',
          ip: '203.0.113.1',
          userAgent: 'curl/8.0',
          referer: null,
        }),
      ).rejects.toBeInstanceOf(LinkNotFoundError);
      expect(analytics.saved).toHaveLength(0);
    });
  });
});
