/**
 * Slug validation and normalization primitives.
 *
 * Pure functions only — no side effects, no I/O. Both the API boundary
 * (Zod `createLinkSchema` in `schemas/links.ts`) and the application layer
 * (`backend/src/domain/slug.ts`) compose these primitives so the rules
 * stay spec-locked in one place.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #6 (slug validation rules)
 *  - `openspec/changes/add-shortpulse-app/design.md` §8 (slug generation)
 *  - `openspec/changes/add-shortpulse-app/design.md` ADR-006 (no leading/trailing hyphen)
 */
import { CUSTOM_SLUG_REGEX, RESERVED_ROUTES } from './constants.js';

/**
 * Normalize a user-supplied slug: lowercase + trim whitespace.
 * Pure function. Does NOT validate — the caller decides what to do with the result.
 */
export function normalizeSlug(slug: string): string {
  return slug.toLowerCase().trim();
}

/**
 * Check a slug against `CUSTOM_SLUG_REGEX` (charset, length, no leading/trailing hyphen).
 *
 * NOTE: this expects an already-normalized input. The composite `validateCustomSlug`
 * normalizes first; this lower-level helper exists for callers that have already
 * normalized (e.g. a Zod schema that has coerced to lowercase) and want a pure
 * format check.
 */
export function isValidCustomSlug(slug: string): boolean {
  return CUSTOM_SLUG_REGEX.test(slug);
}

/**
 * True iff the slug (case-folded) matches one of `RESERVED_ROUTES`.
 * Pure: compares against the frozen reserved set from `constants.ts`.
 */
export function isReservedSlug(slug: string): boolean {
  const lower = slug.toLowerCase();
  return RESERVED_ROUTES.some((r) => r.toLowerCase() === lower);
}

/**
 * Composite validator — returns whether the slug is acceptable AND, if not,
 * a machine-readable reason so the API layer can return the right error.
 *
 * Order of checks (matters for the `reason` field):
 *   1. length   — out of 3-20 range → reason='length'
 *   2. format   — regex violation (charset, leading/trailing hyphen) → reason='format'
 *   3. reserved — falls in the reserved route set → reason='reserved'
 *
 * The length check is the most actionable: a user can fix it directly. Format
 * is next because the regex also encodes length; we report `format` (not
 * `length`) when the user is closer to a fix by adjusting characters than by
 * counting. Reserved is last because it only fires when length AND format
 * already pass — a properly-formed slug that just happens to be a route.
 */
export function validateCustomSlug(slug: string): {
  valid: boolean;
  reason?: 'format' | 'reserved' | 'length';
} {
  if (slug.length < 3 || slug.length > 20) {
    return { valid: false, reason: 'length' };
  }
  if (!CUSTOM_SLUG_REGEX.test(slug)) {
    return { valid: false, reason: 'format' };
  }
  if (isReservedSlug(slug)) {
    return { valid: false, reason: 'reserved' };
  }
  return { valid: true };
}
