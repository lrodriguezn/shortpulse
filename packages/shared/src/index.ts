/**
 * ShortPulse shared package — Zod schemas, constants, helpers, and inferred
 * types shared by the backend and the frontend so the FE/BE contract
 * cannot drift.
 *
 * Consumers import from this single entry point:
 *   - `@shortpulse/backend` Fastify routes use the schemas to validate
 *     requests/responses
 *   - `@shortpulse/frontend` React Hook Form uses them via zodResolver
 *   - Both sides use the slug/url helpers and constants identically
 */

// Constants
export {
  RESERVED_ROUTES,
  AUTO_SLUG_ALPHABET,
  AUTO_SLUG_LENGTH,
  CUSTOM_SLUG_REGEX,
  MAX_SLUG_GENERATE_RETRIES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TIMESERIES_GRANULARITIES,
} from './constants.js';
export type { TimeseriesGranularity } from './constants.js';

// Slug helpers
export { normalizeSlug, isValidCustomSlug, isReservedSlug, validateCustomSlug } from './slug.js';

// Slug generator
export { generateRandomSlug } from './slug-generator.js';

// URL helpers
export { isValidHttpsUrl } from './url.js';

// Zod schemas (single source of truth for the FE/BE contract)
export * from './schemas/index.js';
