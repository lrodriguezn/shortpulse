/**
 * Domain error hierarchy.
 *
 * Every domain error:
 *  - extends `DomainError` (which extends `Error`) so `try/catch` works
 *    naturally and the error-mapper can branch on `instanceof`;
 *  - exposes a stable `code` (machine-readable, part of the FE/BE
 *    contract — appears in the API problem-details body);
 *  - exposes a `statusCode` (canonical HTTP status the Phase 6
 *    error-mapper should return);
 *  - exposes a `message` (human-readable, used as the `detail` field of
 *    RFC 7807 problem-details).
 *
 * Mapping table (also the spec):
 *  - `SlugCollisionError`     409  custom slug already taken
 *  - `ReservedSlugError`      409  slug is in the reserved route set
 *  - `LinkNotFoundError`      404  id or slug not found / soft-deleted
 *  - `InvalidUrlError`        400  originalUrl failed http(s) validation
 *  - `InvalidSlugFormatError` 400  slug failed format / length check
 *  - `SlugGenerationError`    500  auto-slug retries exhausted
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #3, #4, #5
 *  - `openspec/changes/add-shortpulse-app/design.md` §5
 */

/**
 * Base class for every domain-thrown error. Subclasses MUST set
 * `code` and `statusCode` so the error-mapper can branch on either
 * field without `instanceof` chains.
 */
export abstract class DomainError extends Error {
  /** Machine-readable error code, part of the FE/BE contract. */
  public abstract readonly code: string;
  /** Canonical HTTP status code (RFC 9110). */
  public abstract readonly statusCode: number;
}

/**
 * A custom slug collided with an existing record. Maps to HTTP 409
 * with detail `"Ese slug ya existe, prueba otro"` (spec links #1).
 */
export class SlugCollisionError extends DomainError {
  public readonly code = 'slug_collision' as const;
  public readonly statusCode = 409 as const;
  public readonly slug: string;

  constructor(slug: string) {
    super(`Slug ${JSON.stringify(slug)} is already taken`);
    this.name = 'SlugCollisionError';
    this.slug = slug;
  }
}

/**
 * The requested id or slug does not exist (or is soft-deleted). Maps
 * to HTTP 404 (spec links #3, #4).
 */
export class LinkNotFoundError extends DomainError {
  public readonly code = 'link_not_found' as const;
  public readonly statusCode = 404 as const;
  public readonly identifier: string;

  constructor(identifier: string) {
    super(`Link not found: ${JSON.stringify(identifier)}`);
    this.name = 'LinkNotFoundError';
    this.identifier = identifier;
  }
}

/**
 * Auto-slug generation exhausted the retry budget. Maps to HTTP 500
 * (spec links #5, design §8).
 */
export class SlugGenerationError extends DomainError {
  public readonly code = 'slug_generation_failed' as const;
  public readonly statusCode = 500 as const;

  constructor(message: string = 'Slug generation failed after retries') {
    super(message);
    this.name = 'SlugGenerationError';
  }
}

/**
 * The provided `originalUrl` failed the http(s) validation. Maps to
 * HTTP 400 (spec links #1, design §5).
 */
export class InvalidUrlError extends DomainError {
  public readonly code = 'invalid_url' as const;
  public readonly statusCode = 400 as const;
  public readonly url: string;

  constructor(url: string) {
    super(`Invalid URL: ${JSON.stringify(url)} (must be a valid http or https URL)`);
    this.name = 'InvalidUrlError';
    this.url = url;
  }
}

/**
 * The provided slug is in the reserved route set. Maps to HTTP 409
 * (spec links #6, design §8 reserved set).
 */
export class ReservedSlugError extends DomainError {
  public readonly code = 'reserved_slug' as const;
  public readonly statusCode = 409 as const;
  public readonly slug: string;

  constructor(slug: string) {
    super(`Slug ${JSON.stringify(slug)} is reserved`);
    this.name = 'ReservedSlugError';
    this.slug = slug;
  }
}

/**
 * The provided slug failed the format or length check. Maps to HTTP
 * 400 (spec links #6, design §8 CUSTOM_SLUG_REGEX).
 */
export class InvalidSlugFormatError extends DomainError {
  public readonly code = 'invalid_slug' as const;
  public readonly statusCode = 400 as const;
  public readonly slug: string;
  public readonly reason: 'format' | 'length';

  constructor(slug: string, reason: 'format' | 'length') {
    super(
      reason === 'length'
        ? `Slug length must be between 3 and 20 characters (got ${slug.length})`
        : `Slug ${JSON.stringify(slug)} has an invalid format`,
    );
    this.name = 'InvalidSlugFormatError';
    this.slug = slug;
    this.reason = reason;
  }
}
