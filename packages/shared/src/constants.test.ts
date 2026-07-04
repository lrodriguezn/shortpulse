import { describe, it, expect } from 'vitest';
import {
  RESERVED_ROUTES,
  AUTO_SLUG_ALPHABET,
  AUTO_SLUG_LENGTH,
  CUSTOM_SLUG_REGEX,
  MAX_SLUG_GENERATE_RETRIES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TIMESERIES_GRANULARITIES,
} from './constants.js';

describe('RESERVED_ROUTES', () => {
  it('contains exactly the eight reserved routes from the spec', () => {
    // Spec: {analytics, api, health, admin, links, www, favicon, ""} (empty = root route)
    expect(new Set(RESERVED_ROUTES)).toEqual(
      new Set(['analytics', 'api', 'health', 'admin', 'links', 'www', 'favicon', '']),
    );
  });

  it('is a non-empty array of strings', () => {
    expect(Array.isArray(RESERVED_ROUTES)).toBe(true);
    expect(RESERVED_ROUTES.length).toBeGreaterThan(0);
    for (const r of RESERVED_ROUTES) {
      expect(typeof r).toBe('string');
    }
  });
});

describe('AUTO_SLUG_ALPHABET', () => {
  it('is exactly 54 characters long (spec-locked)', () => {
    // Spec: 54-char alphabet, entropy `54^7 ≈ 1.42×10¹²`
    expect(AUTO_SLUG_ALPHABET.length).toBe(54);
  });

  it('only contains ASCII letters and digits', () => {
    for (const ch of AUTO_SLUG_ALPHABET) {
      expect(/^[A-Za-z0-9]$/.test(ch)).toBe(true);
    }
  });

  it('has no duplicate characters', () => {
    expect(new Set(AUTO_SLUG_ALPHABET).size).toBe(AUTO_SLUG_ALPHABET.length);
  });

  it.each(['0', 'O', '1', 'l', 'I', 'i', 'L', 'o'])(
    'excludes the visually-confusable character "%s"',
    (bad) => {
      expect(AUTO_SLUG_ALPHABET).not.toContain(bad);
    },
  );
});

describe('AUTO_SLUG_LENGTH', () => {
  it('is exactly 7 (spec-locked)', () => {
    expect(AUTO_SLUG_LENGTH).toBe(7);
  });
});

describe('CUSTOM_SLUG_REGEX', () => {
  it('accepts a valid lowercase slug of length 3-20', () => {
    expect(CUSTOM_SLUG_REGEX.test('abc')).toBe(true);
    expect(CUSTOM_SLUG_REGEX.test('my-link')).toBe(true);
    expect(CUSTOM_SLUG_REGEX.test('a-b-c-123')).toBe(true);
    // 20 chars exactly
    expect(CUSTOM_SLUG_REGEX.test('a2345678901234567890')).toBe(true);
  });

  it('rejects slugs shorter than 3 characters', () => {
    expect(CUSTOM_SLUG_REGEX.test('')).toBe(false);
    expect(CUSTOM_SLUG_REGEX.test('a')).toBe(false);
    expect(CUSTOM_SLUG_REGEX.test('ab')).toBe(false);
  });

  it('rejects slugs longer than 20 characters', () => {
    // 21 chars
    expect(CUSTOM_SLUG_REGEX.test('a23456789012345678901')).toBe(false);
  });

  it('rejects uppercase letters (chassis is lowercase-only)', () => {
    expect(CUSTOM_SLUG_REGEX.test('MyLink')).toBe(false);
    expect(CUSTOM_SLUG_REGEX.test('ABC')).toBe(false);
  });

  it('rejects characters outside [a-z0-9-]', () => {
    expect(CUSTOM_SLUG_REGEX.test('my_link')).toBe(false); // underscore
    expect(CUSTOM_SLUG_REGEX.test('my link')).toBe(false); // space
    expect(CUSTOM_SLUG_REGEX.test('my.link')).toBe(false); // dot
    expect(CUSTOM_SLUG_REGEX.test('my/link')).toBe(false); // slash
  });

  it('rejects slugs starting with a hyphen (negative lookbehind at start)', () => {
    expect(CUSTOM_SLUG_REGEX.test('-abc')).toBe(false);
  });

  it('rejects slugs ending with a hyphen (negative lookbehind at end)', () => {
    expect(CUSTOM_SLUG_REGEX.test('abc-')).toBe(false);
  });
});

describe('MAX_SLUG_GENERATE_RETRIES', () => {
  it('is 3 (spec-locked: up to 3 retry attempts on unique-constraint violation)', () => {
    expect(MAX_SLUG_GENERATE_RETRIES).toBe(3);
  });
});

describe('pagination bounds', () => {
  it('DEFAULT_PAGE_SIZE is 20', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it('MAX_PAGE_SIZE is 100', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
  });

  it('MAX_PAGE_SIZE is strictly greater than DEFAULT_PAGE_SIZE', () => {
    expect(MAX_PAGE_SIZE).toBeGreaterThan(DEFAULT_PAGE_SIZE);
  });
});

describe('TIMESERIES_GRANULARITIES', () => {
  it('contains exactly day, week, month', () => {
    expect(new Set(TIMESERIES_GRANULARITIES)).toEqual(new Set(['day', 'week', 'month']));
  });

  it('is a non-empty readonly array of string literals', () => {
    expect(Array.isArray(TIMESERIES_GRANULARITIES)).toBe(true);
    expect(TIMESERIES_GRANULARITIES.length).toBe(3);
  });
});
