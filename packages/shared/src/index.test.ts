/**
 * Barrel smoke test — verifies that every public symbol of `@shortpulse/shared`
 * is reachable through the package entry point. This catches broken
 * `export` lines and barrel wiring problems before downstream consumers
 * (Fastify routes, React Hook Form resolvers) hit them at import time.
 */
import { describe, it, expect } from 'vitest';
import {
  // Constants
  AUTO_SLUG_ALPHABET,
  // Slug helpers
  isValidCustomSlug,
  // Slug generator
  generateRandomSlug,
  // URL helper
  isValidHttpsUrl,
  // Zod schemas
  createLinkSchema,
  listLinksQuerySchema,
  linkResponseSchema,
  analyticsEventSchema,
  analyticsSummarySchema,
  timeseriesQuerySchema,
  healthResponseSchema,
  problemDetailsSchema,
} from './index.js';

describe('barrel — @shortpulse/shared public API', () => {
  it('exports the constants used by both BE and FE', () => {
    expect(AUTO_SLUG_ALPHABET).toBeDefined();
    expect(typeof AUTO_SLUG_ALPHABET).toBe('string');
    expect(AUTO_SLUG_ALPHABET.length).toBe(54);
  });

  it('exports the slug helpers', () => {
    expect(isValidCustomSlug).toBeDefined();
    expect(typeof isValidCustomSlug).toBe('function');
    // Behavioral spot-check: the function actually runs and returns a boolean
    expect(isValidCustomSlug('my-link')).toBe(true);
    expect(isValidCustomSlug('BAD!')).toBe(false);
  });

  it('exports the slug generator', () => {
    expect(generateRandomSlug).toBeDefined();
    expect(typeof generateRandomSlug).toBe('function');
    // Behavioral spot-check: it actually runs and produces a 7-char string
    expect(generateRandomSlug()).toHaveLength(7);
  });

  it('exports the URL helper', () => {
    expect(isValidHttpsUrl).toBeDefined();
    expect(typeof isValidHttpsUrl).toBe('function');
    // Behavioral spot-check
    expect(isValidHttpsUrl('https://example.com')).toBe(true);
    expect(isValidHttpsUrl('ftp://example.com')).toBe(false);
  });

  it('exports every Zod schema as a Zod schema object (has parse/safeParse)', () => {
    const schemas = [
      createLinkSchema,
      listLinksQuerySchema,
      linkResponseSchema,
      analyticsEventSchema,
      analyticsSummarySchema,
      timeseriesQuerySchema,
      healthResponseSchema,
      problemDetailsSchema,
    ];
    for (const s of schemas) {
      expect(s).toBeDefined();
      expect(typeof (s as { parse: unknown }).parse).toBe('function');
      expect(typeof (s as { safeParse: unknown }).safeParse).toBe('function');
    }
  });

  it('createLinkSchema parses a minimal valid payload through the barrel', () => {
    // One end-to-end smoke check: importing from the barrel and parsing
    // works without further setup. Catches a misconfigured tsconfig
    // path mapping or a missing re-export.
    const result = createLinkSchema.safeParse({ original_url: 'https://example.com' });
    expect(result.success).toBe(true);
  });
});
