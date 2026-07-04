/**
 * Unit tests for `error-mapper`.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #3-#6 (error mapping)
 *  - `openspec/specs/analytics/spec.md` (no domain-error mapping beyond 500)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (RFC 7807 contract)
 *
 * TDD note: these tests were written first (RED). The implementation
 * in `error-mapper.ts` was written to make them pass (GREEN).
 */
import { describe, expect, it } from 'vitest';

import { mapDomainError } from './error-mapper.js';
import {
  DomainError,
  InvalidSlugFormatError,
  InvalidUrlError,
  LinkNotFoundError,
  ReservedSlugError,
  SlugCollisionError,
  SlugGenerationError,
} from '../domain/errors.js';

describe('mapDomainError', () => {
  describe('SlugCollisionError', () => {
    it('maps to 409 with the spec-locked "Ese slug ya existe, prueba otro" detail', () => {
      const result = mapDomainError(new SlugCollisionError('taken'));
      expect(result.statusCode).toBe(409);
      expect(result.problem.type).toBe('about:blank');
      expect(result.problem.title).toBe('Slug collision');
      expect(result.problem.status).toBe(409);
      expect(result.problem.detail).toBe('Ese slug ya existe, prueba otro');
    });
  });

  describe('ReservedSlugError', () => {
    it('maps to 409 with the reserved-slug detail', () => {
      const result = mapDomainError(new ReservedSlugError('analytics'));
      expect(result.statusCode).toBe(409);
      expect(result.problem.status).toBe(409);
      expect(result.problem.title).toBe('Reserved slug');
      expect(result.problem.detail).toBe('Ese slug está reservado, prueba otro');
    });
  });

  describe('LinkNotFoundError', () => {
    it('maps to 404 with the not-found detail', () => {
      const result = mapDomainError(new LinkNotFoundError('abc'));
      expect(result.statusCode).toBe(404);
      expect(result.problem.status).toBe(404);
      expect(result.problem.title).toBe('Link not found');
      expect(result.problem.detail).toBe('El enlace no existe');
    });
  });

  describe('SlugGenerationError', () => {
    it('maps to 500 with the generation-failed detail', () => {
      const result = mapDomainError(new SlugGenerationError());
      expect(result.statusCode).toBe(500);
      expect(result.problem.status).toBe(500);
      expect(result.problem.title).toBe('Slug generation failed');
      expect(result.problem.detail).toBe('No se pudo generar el slug, intenta de nuevo');
    });
  });

  describe('InvalidUrlError', () => {
    it('maps to 400 with the invalid-url detail', () => {
      const result = mapDomainError(new InvalidUrlError('not-a-url'));
      expect(result.statusCode).toBe(400);
      expect(result.problem.status).toBe(400);
      expect(result.problem.title).toBe('Invalid URL');
      expect(result.problem.detail).toBe('La URL debe ser http o https válida');
    });
  });

  describe('InvalidSlugFormatError', () => {
    it('maps to 400 with the invalid-slug-format detail', () => {
      const result = mapDomainError(new InvalidSlugFormatError('ab', 'length'));
      expect(result.statusCode).toBe(400);
      expect(result.problem.status).toBe(400);
      expect(result.problem.title).toBe('Invalid slug');
      expect(result.problem.detail).toBe(
        'El slug solo puede contener letras, números y guiones (3-20 caracteres)',
      );
    });
  });

  describe('Unknown error', () => {
    it('maps to 500 with the generic-internal-error detail', () => {
      const result = mapDomainError(new Error('boom'));
      expect(result.statusCode).toBe(500);
      expect(result.problem.status).toBe(500);
      expect(result.problem.title).toBe('Internal server error');
      expect(result.problem.detail).toBe('Error interno del servidor');
    });

    it('maps any non-DomainError to 500 (defensive default)', () => {
      // String-thrown errors / non-Error values are all bucketed into
      // the generic 500. The error-mapper does NOT leak raw error
      // messages to the client (per design §5 RFC 7807 contract).
      const result = mapDomainError('a string error');
      expect(result.statusCode).toBe(500);
      expect(result.problem.detail).toBe('Error interno del servidor');
    });
  });

  describe('arbitrary DomainError subclass', () => {
    it('falls back to the statusCode field for any unknown DomainError', () => {
      class CustomDomainError extends DomainError {
        public readonly code = 'custom' as const;
        public readonly statusCode = 418 as const;
        constructor() {
          super('custom error');
          this.name = 'CustomDomainError';
        }
      }
      const result = mapDomainError(new CustomDomainError());
      expect(result.statusCode).toBe(418);
      expect(result.problem.status).toBe(418);
      expect(result.problem.title).toBe('Custom domain');
      expect(result.problem.detail).toBe('Error interno del servidor');
    });
  });
});
