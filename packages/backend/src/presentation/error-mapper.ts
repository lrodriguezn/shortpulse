/**
 * `error-mapper` — convert domain errors to RFC 7807 problem-details
 * HTTP responses.
 *
 * The presentation layer (Fastify routes) calls `mapDomainError` on
 * every caught error from the application use-cases. The returned
 * `statusCode` is the HTTP status, and the `problem` is the body
 * (content-type `application/problem+json` per design §5).
 *
 * Mapping table (spec-locked detail strings — the FE shows them
 * verbatim in a sonner toast):
 *
 * | Domain error              | Status | Title               | Detail                                              |
 * | ------------------------- | ------ | ------------------- | --------------------------------------------------- |
 * | `SlugCollisionError`      | 409    | "Slug collision"    | "Ese slug ya existe, prueba otro"                   |
 * | `ReservedSlugError`       | 409    | "Reserved slug"     | "Ese slug está reservado, prueba otro"              |
 * | `LinkNotFoundError`       | 404    | "Link not found"    | "El enlace no existe"                               |
 * | `SlugGenerationError`     | 500    | "Slug generation failed" | "No se pudo generar el slug, intenta de nuevo" |
 * | `InvalidUrlError`         | 400    | "Invalid URL"       | "La URL debe ser http o https válida"               |
 * | `InvalidSlugFormatError`  | 400    | "Invalid slug"      | "El slug solo puede contener letras, números y guiones (3-20 caracteres)" |
 * | (any unknown error)       | 500    | "Internal server error" | "Error interno del servidor"                   |
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (RFC 7807)
 *  - `openspec/specs/links/spec.md` requirements #1, #3, #4, #5, #6
 *  - RFC 7807 — https://datatracker.ietf.org/doc/html/rfc7807
 */
import type { ProblemDetails } from '@shortpulse/shared';

import {
  DomainError,
  InvalidSlugFormatError,
  InvalidUrlError,
  LinkNotFoundError,
  ReservedSlugError,
  SlugCollisionError,
  SlugGenerationError,
} from '../domain/errors.js';

/** Result returned to Fastify when a use-case throws. */
export interface MappedError {
  /** HTTP status code the controller should respond with. */
  readonly statusCode: number;
  /** RFC 7807 problem-details body (`application/problem+json`). */
  readonly problem: ProblemDetails;
}

/**
 * Convert a thrown error into an HTTP status + problem-details body.
 *
 * - `DomainError` subclasses branch on `instanceof` for spec-locked
 *   `detail` strings.
 * - Any other error (or non-Error value) is bucketed into the generic
 *   500 response — the original message is NEVER leaked to the client
 *   (per design §5 contract).
 *
 * The function is pure: it never throws and has no side effects.
 */
export function mapDomainError(error: unknown): MappedError {
  // Spec-locked 409 — custom slug already taken. The detail string
  // is the EXACT literal the FE shows in a sonner toast.
  if (error instanceof SlugCollisionError) {
    return problem(409, 'Slug collision', 'Ese slug ya existe, prueba otro');
  }

  // Spec-locked 409 — slug is in the reserved route set.
  if (error instanceof ReservedSlugError) {
    return problem(409, 'Reserved slug', 'Ese slug está reservado, prueba otro');
  }

  // Spec-locked 404 — id or slug not found / soft-deleted.
  if (error instanceof LinkNotFoundError) {
    return problem(404, 'Link not found', 'El enlace no existe');
  }

  // Spec-locked 500 — auto-slug retries exhausted.
  if (error instanceof SlugGenerationError) {
    return problem(500, 'Slug generation failed', 'No se pudo generar el slug, intenta de nuevo');
  }

  // Spec-locked 400 — originalUrl failed http(s) validation.
  if (error instanceof InvalidUrlError) {
    return problem(400, 'Invalid URL', 'La URL debe ser http o https válida');
  }

  // Spec-locked 400 — slug failed the format / length / reserved check.
  if (error instanceof InvalidSlugFormatError) {
    return problem(
      400,
      'Invalid slug',
      'El slug solo puede contener letras, números y guiones (3-20 caracteres)',
    );
  }

  // Any other `DomainError` (e.g. future ones) — fall back to the
  // statusCode field, with a generic detail. Title is derived from
  // the error `name` (PascalCase → "Pascal Case") so the response
  // stays self-describing.
  if (error instanceof DomainError) {
    return problem(error.statusCode, humanize(error.name), 'Error interno del servidor');
  }

  // Unknown — generic 500. The original message is intentionally NOT
  // surfaced to the client (per design §5).
  return problem(500, 'Internal server error', 'Error interno del servidor');
}

/** Build a `MappedError` with a uniform shape. */
function problem(status: number, title: string, detail: string): MappedError {
  return {
    statusCode: status,
    problem: {
      type: 'about:blank',
      title,
      status,
      detail,
    },
  };
}

/** "SlugCollisionError" → "Slug collision". PascalCase → spaced + lowercased. */
function humanize(name: string): string {
  return (
    name
      .replace(/Error$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase())
      .trim() || 'Error'
  );
}
