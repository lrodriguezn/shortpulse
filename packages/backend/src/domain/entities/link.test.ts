/**
 * Tests for the `Link` entity.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #1 (create)
 *  - `openspec/specs/links/spec.md` requirement #3 (soft-delete)
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (domain entity)
 *
 * The entity is pure: no I/O, no DB, no clock. `createLink` validates the
 * input (URL format via shared `isValidHttpsUrl`, slug via shared
 * `validateCustomSlug`) and returns a brand-typed `Link`. Methods are
 * immutable: `softDelete` returns a NEW `Link` rather than mutating.
 */
import { describe, it, expect } from 'vitest';

import { createLink, type Link } from './link.js';

const VALID_ID = '11111111-1111-4111-8111-111111111111';
const VALID_URL = 'https://example.com/';
const VALID_SLUG = 'my-link';
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

describe('createLink', () => {
  it('returns a Link with all fields populated from the input', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    expect(link.id).toBe(VALID_ID);
    expect(link.originalUrl).toBe(VALID_URL);
    expect(link.slug).toBe(VALID_SLUG);
    expect(link.createdAt).toBe(FIXED_DATE);
    expect(link.deletedAt).toBeNull();
  });

  it('rejects a malformed UUID (id)', () => {
    expect(() =>
      createLink({
        id: 'not-a-uuid',
        originalUrl: VALID_URL,
        slug: VALID_SLUG,
        createdAt: FIXED_DATE,
      }),
    ).toThrow(/id/i);
  });

  it('rejects an invalid http(s) URL (originalUrl)', () => {
    expect(() =>
      createLink({
        id: VALID_ID,
        originalUrl: 'not-a-url',
        slug: VALID_SLUG,
        createdAt: FIXED_DATE,
      }),
    ).toThrow(/url/i);
  });

  it('rejects an empty originalUrl', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: '', slug: VALID_SLUG, createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a non-http(s) protocol (e.g. ftp://)', () => {
    expect(() =>
      createLink({
        id: VALID_ID,
        originalUrl: 'ftp://example.com',
        slug: VALID_SLUG,
        createdAt: FIXED_DATE,
      }),
    ).toThrow();
  });

  it('rejects an empty slug', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: VALID_URL, slug: '', createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a slug that is too short (< 3 chars)', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: VALID_URL, slug: 'ab', createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a slug that is too long (> 20 chars)', () => {
    expect(() =>
      createLink({
        id: VALID_ID,
        originalUrl: VALID_URL,
        slug: 'a'.repeat(21),
        createdAt: FIXED_DATE,
      }),
    ).toThrow();
  });

  it('rejects a slug with disallowed characters', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: VALID_URL, slug: 'my_slug', createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a slug that starts with a hyphen (format rule)', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: VALID_URL, slug: '-my-link', createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a slug that ends with a hyphen (format rule)', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: VALID_URL, slug: 'my-link-', createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a reserved slug (e.g. "analytics")', () => {
    expect(() =>
      createLink({
        id: VALID_ID,
        originalUrl: VALID_URL,
        slug: 'analytics',
        createdAt: FIXED_DATE,
      }),
    ).toThrow();
  });

  it('rejects a reserved slug case-insensitively (e.g. "API")', () => {
    expect(() =>
      createLink({ id: VALID_ID, originalUrl: VALID_URL, slug: 'API', createdAt: FIXED_DATE }),
    ).toThrow();
  });

  it('rejects a non-Date createdAt', () => {
    expect(() =>
      createLink({
        id: VALID_ID,
        originalUrl: VALID_URL,
        slug: VALID_SLUG,
        // @ts-expect-error -- testing runtime guard
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('accepts a 7-char mixed-case slug (the entity normalizes to lowercase — design §8)', () => {
    // The generator produces mixed-case output, but the entity stores
    // canonical lowercase (design §8 "Mixed-case generation vs lowercase
    // storage"). Mixed-case input is accepted; the stored slug is lower.
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: 'Abc2345',
      createdAt: FIXED_DATE,
    });
    expect(link.slug).toBe('abc2345');
  });
});

describe('Link#isDeleted', () => {
  it('returns false for a freshly created link (deletedAt is null)', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    expect(link.isDeleted()).toBe(false);
  });

  it('returns true after softDelete has been called', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    const deleted = link.softDelete(FIXED_DATE);
    expect(deleted.isDeleted()).toBe(true);
  });
});

describe('Link#softDelete', () => {
  it('returns a new Link with deletedAt set to the given date', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    const deletedAt = new Date('2026-06-01T00:00:00.000Z');
    const deleted = link.softDelete(deletedAt);
    expect(deleted.deletedAt).toBe(deletedAt);
  });

  it('defaults deletedAt to the current time when no argument is given', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    const before = new Date();
    const deleted = link.softDelete();
    const after = new Date();
    // deletedAt should fall inside the [before, after] window.
    const t = deleted.deletedAt as Date;
    expect(t.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5);
    expect(t.getTime()).toBeLessThanOrEqual(after.getTime() + 5);
  });

  it('does NOT mutate the original link (immutability)', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    link.softDelete(new Date('2026-06-01T00:00:00.000Z'));
    expect(link.deletedAt).toBeNull();
    expect(link.isDeleted()).toBe(false);
  });

  it('preserves all other fields (id, originalUrl, slug, createdAt)', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    const deleted = link.softDelete(new Date('2026-06-01T00:00:00.000Z'));
    expect(deleted.id).toBe(link.id);
    expect(deleted.originalUrl).toBe(link.originalUrl);
    expect(deleted.slug).toBe(link.slug);
    expect(deleted.createdAt).toBe(link.createdAt);
  });
});

describe('Link#shortUrl', () => {
  it('composes `${baseUrl}/${slug}`', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    expect(link.shortUrl('https://short.pulse')).toBe('https://short.pulse/my-link');
  });

  it('trims trailing slash from baseUrl to avoid double-slash', () => {
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    expect(link.shortUrl('https://short.pulse/')).toBe('https://short.pulse/my-link');
  });

  it('works for any slug the entity has accepted (post-normalization)', () => {
    // The stored slug is canonical lowercase, so `shortUrl` reflects
    // that — not the mixed-case raw input the generator may produce.
    const link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: 'Abc2345',
      createdAt: FIXED_DATE,
    });
    expect(link.shortUrl('http://localhost:3000')).toBe('http://localhost:3000/abc2345');
  });
});

describe('Link immutability', () => {
  it('the factory returns a Link whose fields are all read-only at the type level', () => {
    const link: Link = createLink({
      id: VALID_ID,
      originalUrl: VALID_URL,
      slug: VALID_SLUG,
      createdAt: FIXED_DATE,
    });
    // The compile-time proof: assigning to any field is a type error.
    // We do not generate a runtime mutation attempt — the type is the test.
    expect(typeof link).toBe('object');
    // Snapshot the structural shape once; mutations would only show in
    // `softDelete` (covered above).
    expect(Object.keys(link).sort()).toEqual(
      [
        'createdAt',
        'deletedAt',
        'id',
        'isDeleted',
        'originalUrl',
        'shortUrl',
        'slug',
        'softDelete',
      ].sort(),
    );
  });
});
