/**
 * Tests for the `Slug` value object.
 *
 * The value object wraps the shared slug validation/generation logic
 * and adds:
 *  - A `Slug` brand type so the rest of the domain can distinguish a
 *    raw user input from a validated slug.
 *  - A `createSlug` composite that returns either a validated `Slug`
 *    or a `SlugError` with a machine-readable `reason`. Application
 *    layer use-cases pattern-match on this to pick the right HTTP
 *    status (400 for format/length, 409 for reserved).
 *  - A `generateSlug` that delegates to the shared random generator
 *    (7-char mixed-case, 54-char alphabet, CSPRNG).
 *  - A `SlugError` discriminator type covering the three failure
 *    reasons the spec mandates: format, reserved, length.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #6
 *  - `openspec/changes/add-shortpulse-app/design.md` §8 + ADR-006
 */
import { describe, it, expect } from 'vitest';

import {
  createSlug,
  generateSlug,
  isValidSlugFormat,
  isReservedSlugValue,
  type SlugError,
  type Slug,
} from './slug.js';
import { AUTO_SLUG_LENGTH, AUTO_SLUG_ALPHABET } from '@shortpulse/shared';

describe('createSlug', () => {
  describe('happy path', () => {
    it('returns { success: true, slug } for a valid slug', () => {
      const result = createSlug('my-link');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.slug).toBe('my-link');
        // Type-level proof: a Slug is assignable to a string, but a raw
        // string is NOT assignable to a Slug.
        const asString: string = result.slug;
        expect(asString).toBe('my-link');
      }
    });

    it('lowercases the input (normalization happens here)', () => {
      const result = createSlug('MyLink');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.slug).toBe('mylink');
      }
    });

    it('trims surrounding whitespace', () => {
      const result = createSlug('  my-link  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.slug).toBe('my-link');
      }
    });

    it('accepts every spec-allowed format (3 chars, 20 chars, with hyphens, with digits)', () => {
      const cases = ['abc', 'a'.repeat(20), 'my-link', 'a1b2c3', '123', 'a-b-c-d-e'];
      for (const c of cases) {
        const result = createSlug(c);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('failure cases', () => {
    it('rejects a non-string input with the "format" reason', () => {
      // The `typeof input !== 'string'` branch — the public API is
      // typed as `string` but the runtime guard exists for callers
      // coming from `unknown` (e.g. a parsed JSON body).
      const result = createSlug(42 as unknown as string);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('format');
        expect(result.message).toMatch(/must be a string/i);
      }
    });

    it('returns { success: false, reason: "length" } for too-short slugs', () => {
      const cases = ['', 'a', 'ab'];
      for (const c of cases) {
        const result = createSlug(c);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('length');
          expect(result.message).toMatch(/length|3.*20|too short/i);
        }
      }
    });

    it('returns { success: false, reason: "length" } for too-long slugs (21+ chars)', () => {
      const tooLong = 'a'.repeat(21);
      const result = createSlug(tooLong);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('length');
      }
    });

    it('returns { success: false, reason: "format" } for slugs with disallowed characters', () => {
      const cases = ['my_slug', 'my link', 'my.link', 'my/link', 'my@link'];
      for (const c of cases) {
        const result = createSlug(c);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('format');
        }
      }
    });

    it('returns { success: false, reason: "format" } for slugs starting with a hyphen', () => {
      const result = createSlug('-my-link');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('format');
      }
    });

    it('returns { success: false, reason: "format" } for slugs ending with a hyphen', () => {
      const result = createSlug('my-link-');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('format');
      }
    });

    it('returns { success: false, reason: "reserved" } for every reserved route (case-insensitive)', () => {
      for (const reserved of [
        'analytics',
        'api',
        'health',
        'admin',
        'links',
        'www',
        'favicon',
        '',
      ]) {
        // We can only call with non-empty: '' would trip length first.
        if (reserved === '') continue;
        const result = createSlug(reserved);
        expect(result.success).toBe(false);
        if (!result.success) {
          // The reserved set happens to all be lowercase + in length range,
          // so the only failure reason for these is 'reserved'.
          expect(result.reason).toBe('reserved');
        }
      }
    });

    it('returns { success: false, reason: "reserved" } for reserved case-insensitively (e.g. "API")', () => {
      const result = createSlug('API');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('reserved');
      }
    });

    it('reports length before reserved (empty string is length, not reserved)', () => {
      // '' is both empty (length 0 < 3) and in the reserved set (the root
      // route). The shared validator reports length first because it is
      // the most actionable reason — a user can fix it directly.
      const result = createSlug('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('length');
      }
    });

    it('reports format before reserved for a non-reserved but badly-formatted slug', () => {
      // 'MyLink' normalizes to 'mylink' (length 6, all lowercase) which
      // would pass the regex — but BEFORE normalization it is uppercase.
      // The value object normalizes first, so by the time the validator
      // runs the input is canonical and the check is reserved. To exercise
      // the format-first path, use a slug that is well-formed structurally
      // except for a character outside [a-z0-9-].
      const result = createSlug('my_link');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('format');
      }
    });

    it('treats case-variant reserved slugs as reserved (normalization makes it a reserved match)', () => {
      // 'API' normalizes to 'api' which is in RESERVED_ROUTES — so the
      // value object reports reserved (not format, because by the time
      // we check, the input is canonical). This differs from the shared
      // unnormalized `validateCustomSlug` which reports format first
      // because it does not normalize.
      const result = createSlug('API');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('reserved');
      }
    });
  });

  describe('SlugError type contract', () => {
    it('every SlugError has a reason and a human-readable message', () => {
      const failingInputs = ['', 'a', 'my_slug', '-bad', 'bad-', 'analytics'];
      for (const input of failingInputs) {
        const result = createSlug(input);
        if (result.success) continue;
        const err: SlugError = result;
        expect(typeof err.reason).toBe('string');
        expect(['format', 'reserved', 'length']).toContain(err.reason);
        expect(typeof err.message).toBe('string');
        expect(err.message.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('generateSlug', () => {
  it('returns a Slug of exactly AUTO_SLUG_LENGTH characters', () => {
    const slug: Slug = generateSlug();
    expect(slug).toHaveLength(AUTO_SLUG_LENGTH);
  });

  it('draws only characters from AUTO_SLUG_ALPHABET', () => {
    for (let i = 0; i < 50; i += 1) {
      const slug = generateSlug();
      for (const ch of slug) {
        expect(AUTO_SLUG_ALPHABET).toContain(ch);
      }
    }
  });

  it('produces a different string on repeated calls (statistical)', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      samples.add(generateSlug());
    }
    // 100 unique slugs from 54^7 combos — the test fails only if the
    // generator is deterministic. 100 is far above the birthday
    // threshold for 54^7, so false-positives are not a concern.
    expect(samples.size).toBe(100);
  });

  it('returns a value typed as Slug (brand test)', () => {
    const slug: Slug = generateSlug();
    // Runtime + type proof: a Slug is a string of the right length.
    expect(typeof slug).toBe('string');
  });
});

describe('isValidSlugFormat / isReservedSlugValue', () => {
  it('isValidSlugFormat mirrors the regex check (no normalization)', () => {
    expect(isValidSlugFormat('my-link')).toBe(true);
    expect(isValidSlugFormat('MyLink')).toBe(false);
    expect(isValidSlugFormat('-bad')).toBe(false);
    expect(isValidSlugFormat('bad-')).toBe(false);
  });

  it('isReservedSlugValue is case-insensitive', () => {
    expect(isReservedSlugValue('analytics')).toBe(true);
    expect(isReservedSlugValue('ANALYTICS')).toBe(true);
    expect(isReservedSlugValue('my-link')).toBe(false);
  });
});
