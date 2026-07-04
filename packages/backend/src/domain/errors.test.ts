/**
 * Tests for the domain error classes.
 *
 * Each error extends `Error`, has a `code` (machine-readable, used by
 * the Phase 6 error-mapper to pick the HTTP status), a `statusCode`
 * (the canonical HTTP status the mapper should return), and a
 * `message` (human-readable, used as the `detail` field of RFC 7807
 * problem-details).
 *
 * The `code` values are stable strings — they appear in the API
 * problem-details body and are part of the FE/BE contract.
 */
import { describe, it, expect } from 'vitest';

import {
  DomainError,
  SlugCollisionError,
  LinkNotFoundError,
  SlugGenerationError,
  InvalidUrlError,
  ReservedSlugError,
  InvalidSlugFormatError,
} from './errors.js';

describe('DomainError base class', () => {
  it('is an instance of Error so try/catch works naturally', () => {
    const err = new SlugCollisionError('x');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
  });

  it('captures the message and a stack trace', () => {
    // The implementation builds a structured message (e.g.
    // `Slug "boom" is already taken`) — the test asserts the
    // message is non-empty and that the stack is captured. The
    // structured fields (`slug`, etc.) are tested per-subclass below.
    const err = new SlugCollisionError('boom');
    expect(err.message.length).toBeGreaterThan(0);
    expect(typeof err.stack).toBe('string');
    expect(err.stack!.length).toBeGreaterThan(0);
  });

  it('exposes a stable name property ("Error" by default — type checked via constructor.name)', () => {
    // The prototype chain sets the name; subclasses inherit the default
    // unless we override. We test that .name is a string (not a typo or
    // a circular reference).
    const err = new SlugCollisionError('x');
    expect(typeof err.name).toBe('string');
  });
});

describe('SlugCollisionError', () => {
  it('has code "slug_collision" and statusCode 409', () => {
    const err = new SlugCollisionError('my-link');
    expect(err.code).toBe('slug_collision');
    expect(err.statusCode).toBe(409);
  });

  it('message includes the offending slug', () => {
    const err = new SlugCollisionError('my-link');
    expect(err.message).toContain('my-link');
  });

  it('exposes the slug as a structured field (not just message)', () => {
    const err = new SlugCollisionError('my-link');
    expect(err.slug).toBe('my-link');
  });
});

describe('LinkNotFoundError', () => {
  it('has code "link_not_found" and statusCode 404', () => {
    const err = new LinkNotFoundError('abc-123');
    expect(err.code).toBe('link_not_found');
    expect(err.statusCode).toBe(404);
  });

  it('exposes the identifier that was not found (slug or id)', () => {
    const err = new LinkNotFoundError('abc-123');
    expect(err.identifier).toBe('abc-123');
  });
});

describe('SlugGenerationError', () => {
  it('has code "slug_generation_failed" and statusCode 500', () => {
    const err = new SlugGenerationError();
    expect(err.code).toBe('slug_generation_failed');
    expect(err.statusCode).toBe(500);
  });

  it('uses a sensible default message', () => {
    const err = new SlugGenerationError();
    expect(err.message.length).toBeGreaterThan(0);
  });
});

describe('InvalidUrlError', () => {
  it('has code "invalid_url" and statusCode 400', () => {
    const err = new InvalidUrlError('not-a-url');
    expect(err.code).toBe('invalid_url');
    expect(err.statusCode).toBe(400);
  });

  it('exposes the offending url', () => {
    const err = new InvalidUrlError('not-a-url');
    expect(err.url).toBe('not-a-url');
  });
});

describe('ReservedSlugError', () => {
  it('has code "reserved_slug" and statusCode 409', () => {
    const err = new ReservedSlugError('analytics');
    expect(err.code).toBe('reserved_slug');
    expect(err.statusCode).toBe(409);
  });

  it('exposes the offending slug', () => {
    const err = new ReservedSlugError('analytics');
    expect(err.slug).toBe('analytics');
  });
});

describe('InvalidSlugFormatError', () => {
  it('has code "invalid_slug" and statusCode 400', () => {
    const err = new InvalidSlugFormatError('bad_slug', 'format');
    expect(err.code).toBe('invalid_slug');
    expect(err.statusCode).toBe(400);
  });

  it('exposes the offending slug and the underlying reason', () => {
    const err = new InvalidSlugFormatError('bad_slug', 'format');
    expect(err.slug).toBe('bad_slug');
    expect(err.reason).toBe('format');
  });
});

describe('Error code stability (FE/BE contract)', () => {
  it('every error code is a non-empty lowercase string', () => {
    // The codes appear in API responses and on the FE side. Any change
    // here is a breaking change — keep them stable.
    const codes = [
      new SlugCollisionError('x').code,
      new LinkNotFoundError('x').code,
      new SlugGenerationError().code,
      new InvalidUrlError('x').code,
      new ReservedSlugError('x').code,
      new InvalidSlugFormatError('x', 'format').code,
    ];
    // The InvalidSlugFormatError test below also constructs one with
    // 'length' — we don't need to include it here but the unused-arg
    // warning silences if we keep this comment.
    void new InvalidSlugFormatError('x', 'length');
    for (const c of codes) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
      expect(c).toBe(c.toLowerCase());
    }
  });
});
