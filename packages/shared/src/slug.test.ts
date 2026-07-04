import { describe, it, expect } from 'vitest';
import { normalizeSlug, isValidCustomSlug, isReservedSlug, validateCustomSlug } from './slug.js';

describe('normalizeSlug', () => {
  it('lowercases uppercase characters', () => {
    expect(normalizeSlug('MyLink')).toBe('mylink');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeSlug('  my-link  ')).toBe('my-link');
  });

  it('lowercases and trims together', () => {
    expect(normalizeSlug('  MyLink  ')).toBe('mylink');
  });

  it('returns the input unchanged when already normalized', () => {
    expect(normalizeSlug('my-link')).toBe('my-link');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeSlug('')).toBe('');
  });
});

describe('isValidCustomSlug', () => {
  it('accepts a lowercase slug of length 3-20 within [a-z0-9-]', () => {
    expect(isValidCustomSlug('abc')).toBe(true);
    expect(isValidCustomSlug('my-link')).toBe(true);
    expect(isValidCustomSlug('a-b-c-123')).toBe(true);
  });

  it('rejects slugs shorter than 3 characters', () => {
    expect(isValidCustomSlug('')).toBe(false);
    expect(isValidCustomSlug('a')).toBe(false);
    expect(isValidCustomSlug('ab')).toBe(false);
  });

  it('rejects slugs longer than 20 characters', () => {
    expect(isValidCustomSlug('a23456789012345678901')).toBe(false); // 21 chars
  });

  it('rejects uppercase (normalization must happen before validation)', () => {
    // The function expects an already-normalized slug; it does NOT lowercase.
    // This matches the design: `validateCustomSlug` is the composite that
    // calls normalize first; `isValidCustomSlug` is the regex-only check.
    expect(isValidCustomSlug('MyLink')).toBe(false);
  });

  it('rejects slugs starting or ending with a hyphen', () => {
    expect(isValidCustomSlug('-abc')).toBe(false);
    expect(isValidCustomSlug('abc-')).toBe(false);
  });

  it('rejects characters outside [a-z0-9-]', () => {
    expect(isValidCustomSlug('my_link')).toBe(false);
    expect(isValidCustomSlug('my link')).toBe(false);
    expect(isValidCustomSlug('my.link')).toBe(false);
  });
});

describe('isReservedSlug', () => {
  it('detects every reserved route from the spec set', () => {
    for (const r of ['analytics', 'api', 'health', 'admin', 'links', 'www', 'favicon', '']) {
      expect(isReservedSlug(r)).toBe(true);
    }
  });

  it('is case-insensitive (lowercases before comparing)', () => {
    expect(isReservedSlug('ANALYTICS')).toBe(true);
    expect(isReservedSlug('Analytics')).toBe(true);
    expect(isReservedSlug('HeAlTh')).toBe(true);
  });

  it('does not match ordinary slugs', () => {
    expect(isReservedSlug('my-link')).toBe(false);
    expect(isReservedSlug('abc')).toBe(false);
  });
});

describe('validateCustomSlug', () => {
  it('returns valid=true for a clean, non-reserved slug', () => {
    expect(validateCustomSlug('my-link')).toEqual({ valid: true });
  });

  it('returns reason=format for uppercase (must be normalized first by caller)', () => {
    const result = validateCustomSlug('MyLink');
    expect(result.valid).toBe(false);
    // Uppercase fails the regex but NOT the length range, so it's a format violation.
    expect(result.reason).toBe('format');
  });

  it('returns reason=length for slugs shorter than 3 chars', () => {
    expect(validateCustomSlug('ab')).toEqual({ valid: false, reason: 'length' });
  });

  it('returns reason=length for slugs longer than 20 chars', () => {
    const long = 'a'.repeat(21);
    expect(validateCustomSlug(long)).toEqual({ valid: false, reason: 'length' });
  });

  it('returns reason=reserved for reserved slugs, even when they would otherwise be valid format', () => {
    // 'analytics' is exactly 9 chars (in range), lowercase, [a-z] charset
    // — only the reserved check should trip it.
    const result = validateCustomSlug('analytics');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('reserved');
  });

  it('returns reason=length for empty string (length 0 is out of 3-20 range)', () => {
    // The empty string is technically also a reserved route (the root),
    // but length comes first per the documented check order. A user
    // submitting '' needs to add characters before they need to pick a
    // different name — so `length` is the most actionable reason.
    expect(validateCustomSlug('')).toEqual({ valid: false, reason: 'length' });
  });

  it('returns reason=format for slugs starting with a hyphen', () => {
    expect(validateCustomSlug('-abc')).toEqual({ valid: false, reason: 'format' });
  });

  it('returns reason=format for slugs ending with a hyphen', () => {
    expect(validateCustomSlug('abc-')).toEqual({ valid: false, reason: 'format' });
  });

  it('returns reason=format for slugs with disallowed characters', () => {
    expect(validateCustomSlug('my_link')).toEqual({ valid: false, reason: 'format' });
    expect(validateCustomSlug('my link')).toEqual({ valid: false, reason: 'format' });
  });

  it('checks format before reserved (a reserved-looking slug with bad format reports format)', () => {
    // 'ANALYTICS' is uppercase — format fails before reserved is checked.
    const result = validateCustomSlug('ANALYTICS');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('format');
  });
});
