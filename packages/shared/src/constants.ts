/**
 * Domain constants for the ShortPulse URL shortener.
 *
 * The auto-slug alphabet is the spec-locked 54-character set described in
 * `openspec/specs/links/spec.md` (requirement #5) and `openspec/changes/add-shortpulse-app/design.md`
 * (section §8). It deliberately excludes every visually-confusable character
 * (`0`, `O`, `1`, `l`, `I`, `i`, `L`, `o`) so the mixed-case generator output
 * reads cleanly in address bars, QR codes, and printed media. Verified to
 * contain exactly 54 unique characters by `constants.test.ts`.
 *
 * Custom-slug validation reuses the same regex at the API boundary
 * (`createLinkSchema`) and the application layer (`domain/slug.ts`), so
 * tightening it here tightens both layers atomically.
 */

/** Routes that MUST NOT collide with user-supplied slugs (spec links #6). */
export const RESERVED_ROUTES: readonly string[] = [
  'analytics',
  'api',
  'health',
  'admin',
  'links',
  'www',
  'favicon',
  '', // root route
] as const;

/**
 * Mixed-case 54-character alphabet for auto-generated slugs.
 *
 * Composition (see design §8):
 *  - 23 uppercase letters (A–Z minus `{I, L, O}`)
 *  - 23 lowercase letters (a–z minus `{i, l, o}`)
 *  - 8 digits (`23456789` — `0` and `1` removed)
 *  - Total: 54 unique characters
 *
 * Entropy at length 7: `54^7 ≈ 1.42 × 10¹²` (~40.5 bits). The storage layer
 * lowercases the generated slug before INSERT, so the unique index catches
 * any collapse; generation space stays at the full 54^7.
 *
 * NOTE: the orchestrator's example string in the slice prompt contained
 * lowercase `i` (`...abcdefghi...`), which would produce 55 chars and break
 * the spec-locked 54. The design §8 verified alphabet (which is what the
 * spec points to) is the version below — `i` excluded for visual clarity.
 */
export const AUTO_SLUG_ALPHABET: string = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Exact length of every auto-generated slug. Spec-mandated: 7. */
export const AUTO_SLUG_LENGTH: number = 7;

/**
 * Custom-slug validation pattern.
 *
 * Spec links #6 (and design §8 / ADR-006): `^(?!-)[a-z0-9-]{3,20}(?<!-)$`.
 * The negative lookarounds reject leading/trailing hyphens to keep
 * address-bar rendering unambiguous.
 */
export const CUSTOM_SLUG_REGEX: RegExp = /^(?!-)[a-z0-9-]{3,20}(?<!-)$/;

/**
 * Maximum retry budget for the auto-slug collision loop. After this many
 * unique-constraint failures the application layer returns a 500
 * (`SlugGenerationError`); spec links #5.
 */
export const MAX_SLUG_GENERATE_RETRIES: number = 3;

/** Default `page_size` for paginated list endpoints. */
export const DEFAULT_PAGE_SIZE: number = 20;

/** Hard upper bound on `page_size` for paginated list endpoints. */
export const MAX_PAGE_SIZE: number = 100;

/**
 * Supported timeseries bucket granularities. Mirrored in
 * `timeseriesQuerySchema` (Zod) and in the Drizzle `date_trunc` call in
 * `get-timeseries.use-case.ts`. Order is alphabetical and stable.
 */
export const TIMESERIES_GRANULARITIES = ['day', 'week', 'month'] as const;
export type TimeseriesGranularity = (typeof TIMESERIES_GRANULARITIES)[number];
