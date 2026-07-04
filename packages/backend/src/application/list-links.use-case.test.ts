/**
 * Tests for `ListLinksUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #2 (list)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 *
 * The use-case is a thin composition:
 *  - `LinkRepository.list` (paginated, excludes soft-deleted per contract)
 *  - `LinkRepository.countClicksByLink` per result link (LEFT JOIN
 *    aggregate — N+1 in this seam; Phase 5 Drizzle impl can optimise
 *    to a single query with a JOIN)
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `list-links.use-case.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { ListLinksUseCase } from './list-links.use-case.js';
import { createLink } from '../domain/entities/link.js';
import type { Link } from '../domain/entities/link.js';
import type { LinkRepository, ListLinksQuery } from '../domain/repositories/link-repository.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class InMemoryLinkRepository implements LinkRepository {
  private store: Link[] = [];
  private clickCounts = new Map<string, number>();

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
  async list(query: ListLinksQuery): Promise<{ data: Link[]; total: number }> {
    const active = this.store.filter((l) => !l.isDeleted());
    const start = (query.page - 1) * query.pageSize;
    return {
      data: active.slice(start, start + query.pageSize),
      total: active.length,
    };
  }
  async countClicksByLink(linkId: string): Promise<number> {
    return this.clickCounts.get(linkId) ?? 0;
  }

  // Test-only helper — sets the per-link click count that the fake
  // repo's `countClicksByLink` will return.
  setClickCount(linkId: string, count: number): void {
    this.clickCounts.set(linkId, count);
  }
}

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

function seedLink(idx: number, slug: string): Link {
  return createLink({
    id: `11111111-1111-4111-8111-${String(idx).padStart(12, '0')}`,
    originalUrl: `https://example.com/${idx}`,
    slug,
    createdAt: FIXED_DATE,
  });
}

describe('ListLinksUseCase', () => {
  let repo: InMemoryLinkRepository;
  let useCase: ListLinksUseCase;

  beforeEach(() => {
    repo = new InMemoryLinkRepository();
    useCase = new ListLinksUseCase({ linkRepository: repo });
  });

  describe('happy path', () => {
    it('returns the paginated data and total count', async () => {
      for (let i = 0; i < 3; i += 1) {
        await repo.save(seedLink(i, `link-${i}`));
      }
      const result = await useCase.execute({ page: 1, pageSize: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
    });

    it('returns an empty list when no links exist', async () => {
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('includes clickCount per link (read via countClicksByLink)', async () => {
      await repo.save(seedLink(0, 'aaa'));
      await repo.save(seedLink(1, 'bbb'));
      repo.setClickCount('11111111-1111-4111-8111-000000000000', 42);
      repo.setClickCount('11111111-1111-4111-8111-000000000001', 7);
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      expect(result.data[0]!.clickCount).toBe(42);
      expect(result.data[1]!.clickCount).toBe(7);
    });

    it('defaults clickCount to 0 for links with no recorded clicks', async () => {
      await repo.save(seedLink(0, 'aaa'));
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      expect(result.data[0]!.clickCount).toBe(0);
    });
  });

  describe('passthrough', () => {
    it('forwards the query parameters to the repository', async () => {
      // Spy on the repo's `list` call so we can verify the exact
      // ListLinksQuery the use-case built. We wrap the instance and
      // delegate the non-spyed methods back to the real repo.
      const captured: ListLinksQuery[] = [];
      const realList = repo.list.bind(repo);
      const spy: LinkRepository = {
        findById: (id) => repo.findById(id),
        findBySlug: (slug) => repo.findBySlug(slug),
        save: (link) => repo.save(link),
        softDelete: (id) => repo.softDelete(id),
        countClicksByLink: (id) => repo.countClicksByLink(id),
        async list(q: ListLinksQuery) {
          captured.push(q);
          return realList(q);
        },
      };
      const uc = new ListLinksUseCase({ linkRepository: spy });
      await uc.execute({
        page: 2,
        pageSize: 5,
        search: 'foo',
        sortBy: 'click_count',
        sortDir: 'asc',
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]).toEqual({
        page: 2,
        pageSize: 5,
        search: 'foo',
        sortBy: 'click_count',
        sortDir: 'asc',
      });
    });

    it('treats search/sortBy/sortDir as optional (only forwards what was given)', async () => {
      const captured: ListLinksQuery[] = [];
      const spy: LinkRepository = {
        findById: (id) => repo.findById(id),
        findBySlug: (slug) => repo.findBySlug(slug),
        save: (link) => repo.save(link),
        softDelete: (id) => repo.softDelete(id),
        countClicksByLink: (id) => repo.countClicksByLink(id),
        async list(q: ListLinksQuery) {
          captured.push(q);
          return { data: [], total: 0 };
        },
      };
      const uc = new ListLinksUseCase({ linkRepository: spy });
      await uc.execute({ page: 1, pageSize: 20 });
      expect(captured[0]).toEqual({ page: 1, pageSize: 20 });
    });
  });

  describe('output shape', () => {
    it('exposes the Link fields the API response needs (id, originalUrl, slug, createdAt)', async () => {
      const link = seedLink(0, 'first');
      await repo.save(link);
      const result = await useCase.execute({ page: 1, pageSize: 20 });
      const row = result.data[0]!;
      expect(row.id).toBe(link.id);
      expect(row.originalUrl).toBe(link.originalUrl);
      expect(row.slug).toBe(link.slug);
      expect(row.createdAt).toEqual(link.createdAt);
    });
  });
});
