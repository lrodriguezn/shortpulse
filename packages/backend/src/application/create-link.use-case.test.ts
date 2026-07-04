/**
 * Tests for `CreateLinkUseCase` (Phase 4 application layer).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1 (create), #5 (slug gen), #6 (slug rules)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6 (create-link flow)
 *
 * The use-case composes:
 *  - `createOriginalUrl` (domain VO) for URL validation → `InvalidUrlError` 400
 *  - `createSlug` (domain VO) for custom-slug validation:
 *      reserved → `ReservedSlugError` 409
 *      length/format → `InvalidSlugFormatError` 400
 *  - `LinkRepository.findBySlug` for collision pre-check → `SlugCollisionError` 409
 *  - the injected `RandomBytes` port for deterministic auto-slug generation
 *  - `LinkRepository.save` for persistence
 *
 * STRICT TDD: these tests were written first; the implementation that
 * makes them pass lives in `create-link.use-case.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { CreateLinkUseCase, drawSlug } from './create-link.use-case.js';
import { InvalidUrlError, ReservedSlugError, SlugCollisionError } from '../domain/errors.js';
import { createLink } from '../domain/entities/link.js';
import type { Link } from '../domain/entities/link.js';
import type { LinkRepository } from '../domain/repositories/link-repository.js';
import type { RandomBytes } from '../domain/ports/random-bytes.js';
import { AUTO_SLUG_ALPHABET, AUTO_SLUG_LENGTH } from '@shortpulse/shared';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** In-memory `LinkRepository` for the use-case tests. Mirrors the
 *  contract from `domain/__tests__/contracts.test.ts` but is local to
 *  this test file.
 *
 *  `findBySlug` is case-insensitive (per design §4 — the storage layer
 *  lowercases on insert and the unique index is case-insensitive).
 *  This lets the auto-slug collision tests seed fixtures via the
 *  entity (which lowercases on store) and still match against the
 *  raw mixed-case candidate the generator emits. */
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

/** Deterministic `RandomBytes` — every call returns a buffer of the
 *  caller-requested size where every byte is `value`. */
class FixedRandomBytes implements RandomBytes {
  constructor(private readonly value: number) {}
  randomBytes(size: number): Buffer {
    return Buffer.alloc(size, this.value);
  }
}

/** Sequence-based `RandomBytes` — each successive call returns a
 *  buffer filled with the next value in `values` (wraps at the end).
 *  Used to force the retry loop to draw DIFFERENT slugs on each
 *  iteration. The default test fixture uses `[0x10, 0x20]`:
 *   - `0x10 % 54 = 16` → `AUTO_SLUG_ALPHABET[16] = 'T'` (uppercase)
 *   - `0x20 % 54 = 32` → `AUTO_SLUG_ALPHABET[32] = 'k'` (lowercase)
 *  The Drizzle storage lowercases 'T' → 't' on insert (per design §4),
 *  so the seeded slug is 'ttttttt' and `findBySlug` (case-insensitive)
 *  matches the raw 'TTTTTTT' candidate the first draw produces. */
class SequenceRandomBytes implements RandomBytes {
  private callIdx = 0;
  constructor(private readonly values: readonly number[]) {}
  randomBytes(size: number): Buffer {
    const v = this.values[this.callIdx % this.values.length]!;
    this.callIdx += 1;
    return Buffer.alloc(size, v);
  }
}

const FIXED_ID = '11111111-1111-4111-8111-111111111111';
const BASE_URL = 'https://short.pulse';
const VALID_URL = 'https://example.com/page';

// ---------------------------------------------------------------------------
// WU1: CreateLinkUseCase
// ---------------------------------------------------------------------------

describe('CreateLinkUseCase', () => {
  let repo: InMemoryLinkRepository;
  let rng: FixedRandomBytes;
  let useCase: CreateLinkUseCase;

  beforeEach(() => {
    repo = new InMemoryLinkRepository();
    rng = new FixedRandomBytes(0x10); // deterministic
    useCase = new CreateLinkUseCase({ linkRepository: repo, randomBytes: rng });
  });

  describe('custom slug path', () => {
    it('creates a link with a valid custom slug and returns all required fields', async () => {
      const result = await useCase.execute({
        originalUrl: VALID_URL,
        slug: 'my-link',
        baseUrl: BASE_URL,
      });

      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(result.originalUrl).toBe(VALID_URL);
      expect(result.slug).toBe('my-link');
      expect(result.shortUrl).toBe(`${BASE_URL}/my-link`);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.clickCount).toBe(0);
    });

    it('normalises the custom slug to lowercase (canonical storage per design §8)', async () => {
      const result = await useCase.execute({
        originalUrl: VALID_URL,
        slug: 'MyLink',
        baseUrl: BASE_URL,
      });
      expect(result.slug).toBe('mylink');
      expect(result.shortUrl).toBe(`${BASE_URL}/mylink`);
    });

    it('trims trailing slash from baseUrl when composing shortUrl (no double slash)', async () => {
      const result = await useCase.execute({
        originalUrl: VALID_URL,
        slug: 'my-link',
        baseUrl: `${BASE_URL}/`,
      });
      expect(result.shortUrl).toBe(`${BASE_URL}/my-link`);
    });

    it('persists the link in the repository (findBySlug returns it)', async () => {
      await useCase.execute({
        originalUrl: VALID_URL,
        slug: 'my-link',
        baseUrl: BASE_URL,
      });
      const stored = await repo.findBySlug('my-link');
      expect(stored).not.toBeNull();
      expect(stored!.originalUrl).toBe(VALID_URL);
    });
  });

  describe('error handling — custom slug', () => {
    it('throws SlugCollisionError (409) when the custom slug already exists', async () => {
      // Seed a link with slug 'taken'
      const existing = createLink({
        id: FIXED_ID,
        originalUrl: VALID_URL,
        slug: 'taken',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await repo.save(existing);

      await expect(
        useCase.execute({ originalUrl: VALID_URL, slug: 'taken', baseUrl: BASE_URL }),
      ).rejects.toMatchObject({
        name: 'SlugCollisionError',
        code: 'slug_collision',
        statusCode: 409,
        slug: 'taken',
      });
    });

    it('throws SlugCollisionError case-insensitively (existing "taken" blocks "TAKEN")', async () => {
      const existing = createLink({
        id: FIXED_ID,
        originalUrl: VALID_URL,
        slug: 'taken',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await repo.save(existing);

      await expect(
        useCase.execute({ originalUrl: VALID_URL, slug: 'TAKEN', baseUrl: BASE_URL }),
      ).rejects.toBeInstanceOf(SlugCollisionError);
    });

    it('throws ReservedSlugError (409) when the custom slug is in the reserved set', async () => {
      await expect(
        useCase.execute({ originalUrl: VALID_URL, slug: 'analytics', baseUrl: BASE_URL }),
      ).rejects.toBeInstanceOf(ReservedSlugError);
    });

    it('throws ReservedSlugError case-insensitively (e.g. "API")', async () => {
      await expect(
        useCase.execute({ originalUrl: VALID_URL, slug: 'API', baseUrl: BASE_URL }),
      ).rejects.toBeInstanceOf(ReservedSlugError);
    });

    it('throws InvalidSlugFormatError (400, reason: "length") for too-short slugs', async () => {
      await expect(
        useCase.execute({ originalUrl: VALID_URL, slug: 'ab', baseUrl: BASE_URL }),
      ).rejects.toMatchObject({
        name: 'InvalidSlugFormatError',
        code: 'invalid_slug',
        statusCode: 400,
        reason: 'length',
      });
    });

    it('throws InvalidSlugFormatError (400, reason: "format") for slugs with disallowed characters', async () => {
      await expect(
        useCase.execute({ originalUrl: VALID_URL, slug: 'my_slug', baseUrl: BASE_URL }),
      ).rejects.toMatchObject({
        name: 'InvalidSlugFormatError',
        code: 'invalid_slug',
        statusCode: 400,
        reason: 'format',
      });
    });
  });

  describe('auto-slug path', () => {
    it('generates a 7-character auto-slug drawn from the 54-char alphabet', async () => {
      const result = await useCase.execute({ originalUrl: VALID_URL, baseUrl: BASE_URL });
      expect(result.slug).toHaveLength(AUTO_SLUG_LENGTH);
      for (const ch of result.slug) {
        expect(AUTO_SLUG_ALPHABET).toContain(ch);
      }
    });

    it('composes shortUrl from baseUrl + the generated slug', async () => {
      const result = await useCase.execute({ originalUrl: VALID_URL, baseUrl: BASE_URL });
      expect(result.shortUrl).toBe(`${BASE_URL}/${result.slug}`);
    });

    it('persists the link with the auto-generated slug', async () => {
      const result = await useCase.execute({ originalUrl: VALID_URL, baseUrl: BASE_URL });
      const stored = await repo.findBySlug(result.slug);
      expect(stored).not.toBeNull();
      expect(stored!.originalUrl).toBe(VALID_URL);
    });

    it('retries the auto-slug when the first draw collides and succeeds on a later draw', async () => {
      // Sequence RNG: first call 0x10 → 'T' upper, second 0x20 → 'k' lower.
      // Seed 'TTTTTTT' (entity lowercases to 'ttttttt'; findBySlug is
      // case-insensitive so the raw 'TTTTTTT' candidate matches).
      const sequenceRng = new SequenceRandomBytes([0x10, 0x20]);
      const sequenceUseCase = new CreateLinkUseCase({
        linkRepository: repo,
        randomBytes: sequenceRng,
      });
      await repo.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'TTTTTTT',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      const result = await sequenceUseCase.execute({
        originalUrl: VALID_URL,
        baseUrl: BASE_URL,
      });
      // First draw collides ('TTTTTTT'); second draw wins ('kkkkkkk').
      expect(result.slug).toBe('kkkkkkk');
    });

    it('throws SlugGenerationError (500) after exhausting the retry budget', async () => {
      // Single-value RNG: every draw produces the same 'T'-heavy slug.
      // Pre-seed it (entity lowercases on store) so all retries collide.
      const singleRng = new FixedRandomBytes(0x10);
      const singleUseCase = new CreateLinkUseCase({
        linkRepository: repo,
        randomBytes: singleRng,
      });
      await repo.save(
        createLink({
          id: FIXED_ID,
          originalUrl: VALID_URL,
          slug: 'TTTTTTT',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      await expect(
        singleUseCase.execute({ originalUrl: VALID_URL, baseUrl: BASE_URL }),
      ).rejects.toMatchObject({
        name: 'SlugGenerationError',
        code: 'slug_generation_failed',
        statusCode: 500,
      });
    });
  });

  describe('error handling — URL', () => {
    it('throws InvalidUrlError (400) when the URL is not a valid http(s) URL', async () => {
      await expect(
        useCase.execute({ originalUrl: 'not-a-url', baseUrl: BASE_URL }),
      ).rejects.toMatchObject({
        name: 'InvalidUrlError',
        code: 'invalid_url',
        statusCode: 400,
      });
    });

    it('throws InvalidUrlError (400) when the URL uses ftp://', async () => {
      await expect(
        useCase.execute({ originalUrl: 'ftp://example.com', baseUrl: BASE_URL }),
      ).rejects.toBeInstanceOf(InvalidUrlError);
    });
  });
});

// ---------------------------------------------------------------------------
// drawSlug helper (consumed by CreateLinkUseCase)
// ---------------------------------------------------------------------------

describe('drawSlug (helper consumed by CreateLinkUseCase)', () => {
  it('returns a 7-char string drawn from AUTO_SLUG_ALPHABET', () => {
    const slug = drawSlug(new FixedRandomBytes(0x10));
    expect(slug).toHaveLength(AUTO_SLUG_LENGTH);
    for (const ch of slug) {
      expect(AUTO_SLUG_ALPHABET).toContain(ch);
    }
  });
});
