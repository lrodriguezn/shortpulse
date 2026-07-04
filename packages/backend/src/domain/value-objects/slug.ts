/**
 * `Slug` value object.
 *
 * The branded `Slug` type is a phantom: it is a `string` at runtime
 * but a distinct type at compile time. The factory wraps the shared
 * `validateCustomSlug` (single source of truth for the rules) and
 * returns either a validated `Slug` or a `SlugError` discriminator
 * the application layer pattern-matches on to pick the right HTTP
 * status (400 for format/length, 409 for reserved).
 *
 * The auto-generator delegates to the shared `generateRandomSlug`
 * (CSPRNG, rejection sampling, 54-char alphabet) and re-brands the
 * result so callers can pass a `Slug` everywhere a string is expected
 * but not the other way around.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #6
 *  - `openspec/changes/add-shortpulse-app/design.md` §8 + ADR-006
 */
import {
  isReservedSlug as sharedIsReservedSlug,
  isValidCustomSlug as sharedIsValidCustomSlug,
  validateCustomSlug as sharedValidateCustomSlug,
  generateRandomSlug,
} from '@shortpulse/shared';

/**
 * Branded `Slug` type. At runtime it is a plain string; the `__slug`
 * phantom marker is what makes TypeScript refuse to assign a raw
 * `string` to a `Slug` parameter.
 */
export type Slug = string & { readonly __slug: unique symbol };

/** Human-readable reason a slug was rejected. Mirrors the shared validator. */
export type SlugReasonValue = 'format' | 'reserved' | 'length';

/**
 * Discriminated error variant for `createSlug`. The `reason` matches
 * the shared validator exactly so the application layer can reuse the
 * error-mapping table from design §6.
 */
export type SlugError = {
  readonly success: false;
  readonly reason: SlugReasonValue;
  readonly message: string;
};

/** Discriminated result type returned by `createSlug`. */
export type SlugResult = { readonly success: true; readonly slug: Slug } | SlugError;

/** Internal — wrap a validated raw string in the `Slug` brand. */
function brand(value: string): Slug {
  return value as Slug;
}

/** Internal helper — build a `SlugError` with the standard message for the given reason. */
function makeError(reason: SlugReasonValue, value: string): SlugError {
  return { success: false, reason, message: reasonToMessage(reason, value) };
}

/**
 * Composite validator. Returns a discriminated result so callers
 * pattern-match without `try/catch`. Order of checks matches the
 * shared validator: length, format, reserved.
 */
export function createSlug(input: string): SlugResult {
  if (typeof input !== 'string') {
    return { success: false, reason: 'format', message: 'Slug must be a string' };
  }
  const normalized = input.toLowerCase().trim();
  const result = sharedValidateCustomSlug(normalized);
  if (result.valid) {
    return { success: true, slug: brand(normalized) };
  }
  // The shared validator always sets `reason` on failure; the `??` is a
  // type-narrowing safety net (and never fires at runtime).
  return makeError(result.reason ?? 'format', normalized);
}

/**
 * Generate a random slug. Delegates to the shared CSPRNG generator
 * (54-char mixed alphabet, rejection sampling, length 7 by default).
 * The application layer (Phase 4) drives the retry loop on
 * unique-constraint violations; this function is a one-shot draw.
 */
export function generateSlug(): Slug {
  return brand(generateRandomSlug());
}

/** Format check only — no normalization. Useful for callers that have already normalized. */
export function isValidSlugFormat(slug: string): boolean {
  return sharedIsValidCustomSlug(slug);
}

/** Reserved check only — case-insensitive against the spec-locked reserved set. */
export function isReservedSlugValue(slug: string): boolean {
  return sharedIsReservedSlug(slug);
}

/** Map a failure reason to a human-readable message. Centralised so the API layer can use the same string. */
function reasonToMessage(reason: SlugReasonValue, value: string): string {
  const messages: Record<SlugReasonValue, (v: string) => string> = {
    length: (v) => `Slug length must be between 3 and 20 characters (got: ${v.length})`,
    format: (v) => `Slug must match ${'^(?!-)[a-z0-9-]{3,20}(?<!-)$'} (got: ${JSON.stringify(v)})`,
    reserved: (v) => `Slug ${JSON.stringify(v)} is reserved`,
  };
  return messages[reason](value);
}
