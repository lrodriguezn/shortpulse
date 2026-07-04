/**
 * Tests for `DeleteLinkUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #3 (soft-delete, idempotent)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6
 *
 * Flow (per spec #3 + design §6):
 *  1. `LinkRepository.findById` → 404 on miss.
 *  2. If already soft-deleted → idempotent (return void; controller 204).
 *  3. Otherwise `LinkRepository.softDelete` → return void (controller 204).
 *
 * The use-case does NOT throw on already-deleted — the controller
 * treats both `not found`, `success`, and `already deleted` the same
 * way (204). The 404 is reserved for "id never existed".
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `delete-link.use-case.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { DeleteLinkUseCase } from './delete-link.use-case.js';
import { LinkNotFoundError } from '../domain/errors.js';
import { createLink } from '../domain/entities/link.js';
import type { Link } from '../domain/entities/link.js';
import type { LinkRepository } from '../domain/repositories/link-repository.js';

class InMemoryLinkRepository implements LinkRepository {
  private store: Link[] = [];
  private softDeleteCalls: string[] = [];

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
    this.softDeleteCalls.push(id);
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

  // Test-only helper — exposes the call log so tests can verify the
  // use-case does (or does not) call `softDelete` per scenario.
  get softDeleteCallLog(): readonly string[] {
    return this.softDeleteCalls;
  }
}

const FIXED_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';
const VALID_URL = 'https://example.com/';
const VALID_SLUG = 'my-link';

describe('DeleteLinkUseCase', () => {
  let repo: InMemoryLinkRepository;
  let useCase: DeleteLinkUseCase;

  beforeEach(() => {
    repo = new InMemoryLinkRepository();
    useCase = new DeleteLinkUseCase({ linkRepository: repo });
  });

  it('soft-deletes an active link and calls repo.softDelete(id) exactly once', async () => {
    await repo.save(
      createLink({
        id: FIXED_ID,
        originalUrl: VALID_URL,
        slug: VALID_SLUG,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    await expect(useCase.execute({ id: FIXED_ID })).resolves.toBeUndefined();
    expect(repo.softDeleteCallLog).toEqual([FIXED_ID]);

    // Verify the link is now soft-deleted (not returned by findBySlug).
    const found = await repo.findBySlug(VALID_SLUG);
    expect(found).toBeNull();
  });

  it('is idempotent on already-deleted links (does NOT throw, does NOT re-call softDelete)', async () => {
    const deleted = createLink({
      id: FIXED_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }).softDelete(new Date('2026-06-01T00:00:00.000Z'));
    await repo.save(deleted);

    await expect(useCase.execute({ id: FIXED_ID })).resolves.toBeUndefined();
    // The use-case checks the link's `isDeleted()` flag and short-
    // circuits — `softDelete` MUST NOT be called a second time.
    expect(repo.softDeleteCallLog).toEqual([]);
  });

  it('throws LinkNotFoundError (404) when the id does not exist', async () => {
    await expect(useCase.execute({ id: MISSING_ID })).rejects.toBeInstanceOf(LinkNotFoundError);
  });

  it('throws LinkNotFoundError with the offending id in the message', async () => {
    await expect(useCase.execute({ id: MISSING_ID })).rejects.toMatchObject({
      name: 'LinkNotFoundError',
      code: 'link_not_found',
      statusCode: 404,
      identifier: MISSING_ID,
    });
  });

  it('does NOT call repo.softDelete when the id does not exist', async () => {
    await expect(useCase.execute({ id: MISSING_ID })).rejects.toBeInstanceOf(LinkNotFoundError);
    expect(repo.softDeleteCallLog).toEqual([]);
  });
});
