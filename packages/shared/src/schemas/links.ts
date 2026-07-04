/**
 * Zod request/response schemas for the `/api/links` endpoints.
 *
 * These are the single source of truth for the FE/BE contract:
 *  - `createLinkSchema` is the body of `POST /api/links`
 *  - `listLinksQuerySchema` is the querystring of `GET /api/links`
 *  - `linkResponseSchema` is the body of `POST /api/links` (201) AND
 *    each element of the `data[]` array in `GET /api/links`
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #2
 *  - `openspec/changes/add-shortpulse-app/design.md` §5
 */
import { z } from 'zod';
import { CUSTOM_SLUG_REGEX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

/**
 * POST /api/links body.
 *
 * - `original_url` must be a real URL AND use the http(s) protocol.
 *   `z.string().url()` alone accepts `ftp://`, `file://`, `data:`, etc.
 *   so we refine with a regex (per design §5 fix 3).
 * - `slug` is optional; when present, it MUST match the spec regex
 *   (lowercase, 3-20 chars, no leading/trailing hyphen). The BE lowercases
 *   the slug before storage; clients are NOT required to pre-lowercase.
 */
export const createLinkSchema = z.object({
  original_url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), { message: 'Must be an http or https URL' }),
  slug: z.string().regex(CUSTOM_SLUG_REGEX).optional(),
});
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

/**
 * GET /api/links querystring. `page` and `page_size` are coerced from
 * strings (Fastify gives us the raw querystring) to numbers.
 */
export const listLinksQuerySchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(['created_at', 'original_url', 'slug', 'click_count']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ListLinksQuery = z.infer<typeof listLinksQuerySchema>;

/**
 * Shape of a single link in API responses. `short_url` is computed server-side
 * as `${BASE_URL}/${slug}`. `click_count` is a LEFT JOIN aggregate from the
 * analytics table (see design §4 / `drizzle-link.repository.ts`).
 */
export const linkResponseSchema = z.object({
  id: z.string().uuid(),
  original_url: z.string().url(),
  slug: z.string(),
  short_url: z.string().url(),
  created_at: z.string().datetime(),
  click_count: z.number().int().nonnegative(),
  deleted_at: z.string().datetime().nullable(),
});
export type LinkResponse = z.infer<typeof linkResponseSchema>;
