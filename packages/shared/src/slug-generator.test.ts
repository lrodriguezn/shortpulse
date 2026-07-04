import { describe, it, expect } from 'vitest';
import { generateRandomSlug } from './slug-generator.js';
import { AUTO_SLUG_ALPHABET, AUTO_SLUG_LENGTH } from './constants.js';

describe('generateRandomSlug', () => {
  describe('default length', () => {
    it('returns a string of exactly AUTO_SLUG_LENGTH (7) characters', () => {
      const slug = generateRandomSlug();
      expect(slug).toHaveLength(AUTO_SLUG_LENGTH);
    });

    it('produces a different string on repeated calls (statistical)', () => {
      // Birthday: with 54^7 combos the collision probability at 1000 is
      // astronomically small. The test fails only if the function is broken
      // (e.g. always returns the same string).
      const samples = new Set<string>();
      for (let i = 0; i < 1000; i += 1) {
        samples.add(generateRandomSlug());
      }
      // 1000 unique slugs out of 1000 calls — at 54^7 combos this is
      // overwhelmingly likely; the assertion catches deterministic bugs.
      expect(samples.size).toBe(1000);
    });
  });

  describe('custom length', () => {
    it('respects an explicit length argument', () => {
      expect(generateRandomSlug(1)).toHaveLength(1);
      expect(generateRandomSlug(5)).toHaveLength(5);
      expect(generateRandomSlug(20)).toHaveLength(20);
    });

    it('handles length 0 (returns empty string)', () => {
      expect(generateRandomSlug(0)).toBe('');
    });
  });

  describe('alphabet compliance', () => {
    it('uses only characters from AUTO_SLUG_ALPHABET', () => {
      for (let i = 0; i < 200; i += 1) {
        const slug = generateRandomSlug();
        for (const ch of slug) {
          expect(AUTO_SLUG_ALPHABET).toContain(ch);
        }
      }
    });

    it('produces mixed-case output (uppercase and lowercase letters both appear)', () => {
      // 200 samples × 7 chars = 1400 chars from a 54-char alphabet that has
      // 23 upper + 23 lower + 8 digits. The chance of seeing zero of either
      // case in 1400 chars is negligible — if the function only emits one
      // case, this fails immediately.
      const big = Array.from({ length: 200 }, () => generateRandomSlug()).join('');
      const hasUpper = /[A-Z]/.test(big);
      const hasLower = /[a-z]/.test(big);
      const hasDigit = /[0-9]/.test(big);
      expect(hasUpper).toBe(true);
      expect(hasLower).toBe(true);
      expect(hasDigit).toBe(true);
    });
  });

  describe('distribution sanity', () => {
    it('visits at least 40 of the 54 alphabet characters across 1000 samples', () => {
      // 54^7 = ~1.4e12, 1000 samples = 7000 chars. Expected unique chars
      // covered ≈ 54 × (1 − (53/54)^7000) which is essentially 54, but
      // 40 is a sane lower bound that still catches a broken RNG (e.g. one
      // that only emits lowercase).
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i += 1) {
        for (const ch of generateRandomSlug()) {
          seen.add(ch);
        }
      }
      expect(seen.size).toBeGreaterThanOrEqual(40);
    });
  });
});
