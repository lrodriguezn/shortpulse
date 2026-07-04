/**
 * Integration tests for `links-routes` (Fastify plugin).
 *
 * The plugin is mounted on the `/api/links` prefix and exposes:
 *  - `POST   /api/links`         — create (201 + linkResponseSchema)
 *  - `GET    /api/links`         — list (200 + {data, total, page, page_size})
 *  - `DELETE /api/links/:id`     — soft-delete (204 | 404)
 *
 * Tests use Fastify `inject()` (light-my-request) with mocked
 * use-cases — no DB, no MaxMind file. The mocked use-cases
 * implement the same `execute(input)` shape the production
 * use-cases do, so the routing + validation + error-mapping is
 * exercised end-to-end without spinning up Postgres.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #2, #3
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 *
 * TDD note: tests were written first (RED). The plugin in
 * `links-routes.ts` was written to make them pass (GREEN).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { linksRoutes } from './links-routes.js';
import {
  InvalidSlugFormatError,
  LinkNotFoundError,
  ReservedSlugError,
  SlugCollisionError,
} from '../domain/errors.js';

import type { CreateLinkUseCase } from '../application/create-link.use-case.js';
import type { DeleteLinkUseCase } from '../application/delete-link.use-case.js';
import type { ListLinksUseCase } from '../application/list-links.use-case.js';
import type { ListLinksRow } from '../application/list-links.use-case.js';

interface UseCaseStubs {
  createLink: Pick<CreateLinkUseCase, 'execute'>;
  listLinks: Pick<ListLinksUseCase, 'execute'>;
  deleteLink: Pick<DeleteLinkUseCase, 'execute'>;
}

function buildStubs(): {
  stubs: UseCaseStubs;
  createLink: ReturnType<typeof vi.fn>;
  listLinks: ReturnType<typeof vi.fn>;
  deleteLink: ReturnType<typeof vi.fn>;
} {
  const createLink = vi.fn();
  const listLinks = vi.fn();
  const deleteLink = vi.fn();
  return {
    stubs: {
      createLink: { execute: createLink },
      listLinks: { execute: listLinks },
      deleteLink: { execute: deleteLink },
    },
    createLink,
    listLinks,
    deleteLink,
  };
}

async function buildApp(stubs: UseCaseStubs): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(linksRoutes, {
    useCases: stubs,
    baseUrl: 'http://localhost:3000',
  });
  return app;
}

describe('links-routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { stubs } = buildStubs();
    app = await buildApp(stubs);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/links', () => {
    it('returns 201 + linkResponseSchema-shaped body on success', async () => {
      const { stubs, createLink } = buildStubs();
      const testApp = await buildApp(stubs);
      const created = {
        id: '00000000-0000-0000-0000-000000000001',
        originalUrl: 'https://example.com',
        slug: 'my-link',
        shortUrl: 'http://localhost:3000/my-link',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        clickCount: 0,
      };
      createLink.mockResolvedValueOnce(created);

      const response = await testApp.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'https://example.com', slug: 'my-link' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        id: created.id,
        original_url: 'https://example.com',
        slug: 'my-link',
        short_url: 'http://localhost:3000/my-link',
        click_count: 0,
        deleted_at: null,
      });
      expect(body.created_at).toBe(created.createdAt.toISOString());
      // Use-case was called with the right input shape.
      expect(createLink).toHaveBeenCalledWith({
        originalUrl: 'https://example.com',
        slug: 'my-link',
        baseUrl: 'http://localhost:3000',
      });
      await testApp.close();
    });

    it('auto-generates a slug when none is supplied (use-case gets undefined)', async () => {
      const { stubs, createLink } = buildStubs();
      const testApp = await buildApp(stubs);
      createLink.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000002',
        originalUrl: 'https://example.com',
        slug: 'auto7ch',
        shortUrl: 'http://localhost:3000/auto7ch',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        clickCount: 0,
      });

      const response = await testApp.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'https://example.com' },
      });

      expect(response.statusCode).toBe(201);
      expect(createLink).toHaveBeenCalledWith({
        originalUrl: 'https://example.com',
        slug: undefined,
        baseUrl: 'http://localhost:3000',
      });
      await testApp.close();
    });

    it('returns 400 + problem-details when body fails Zod validation (bad URL)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'not-a-url' },
      });
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.status).toBe(400);
      expect(body.title).toBe('Bad Request');
    });

    it('returns 400 + problem-details when body is missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 409 + spec-locked detail on SlugCollisionError', async () => {
      const { stubs, createLink } = buildStubs();
      const testApp = await buildApp(stubs);
      createLink.mockRejectedValueOnce(new SlugCollisionError('taken'));

      const response = await testApp.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'https://example.com', slug: 'taken' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.status).toBe(409);
      expect(body.title).toBe('Slug collision');
      expect(body.detail).toBe('Ese slug ya existe, prueba otro');
      await testApp.close();
    });

    it('returns 409 on ReservedSlugError', async () => {
      const { stubs, createLink } = buildStubs();
      const testApp = await buildApp(stubs);
      createLink.mockRejectedValueOnce(new ReservedSlugError('analytics'));

      const response = await testApp.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'https://example.com', slug: 'analytics' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().detail).toBe('Ese slug está reservado, prueba otro');
      await testApp.close();
    });

    it('returns 400 on InvalidSlugFormatError (length / format)', async () => {
      const { stubs, createLink } = buildStubs();
      const testApp = await buildApp(stubs);
      // The use-case throws `InvalidSlugFormatError` only after the
      // shared Zod schema passes — the use-case also re-validates
      // the slug via `createSlug()` (which checks the reserved set
      // too). We mock the throw to exercise the error-mapper branch.
      createLink.mockRejectedValueOnce(new InvalidSlugFormatError('xyz', 'format'));

      const response = await testApp.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'https://example.com', slug: 'xyz' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe(
        'El slug solo puede contener letras, números y guiones (3-20 caracteres)',
      );
      await testApp.close();
    });
  });

  describe('GET /api/links', () => {
    it('returns 200 + {data, total, page, page_size} on success', async () => {
      const { stubs, listLinks } = buildStubs();
      const testApp = await buildApp(stubs);
      const row: ListLinksRow = {
        id: '00000000-0000-0000-0000-000000000003',
        originalUrl: 'https://example.com',
        slug: 'a',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        clickCount: 5,
      };
      listLinks.mockResolvedValueOnce({ data: [row], total: 1, page: 1, pageSize: 20 });

      const response = await testApp.inject({
        method: 'GET',
        url: '/api/links?page=1&page_size=20',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        data: [
          {
            id: row.id,
            original_url: 'https://example.com',
            slug: 'a',
            short_url: 'http://localhost:3000/a',
            created_at: row.createdAt.toISOString(),
            click_count: 5,
            deleted_at: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      });
      // Use-case input was coerced from string querystring to numbers.
      expect(listLinks).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        search: undefined,
        sortBy: 'created_at',
        sortDir: 'desc',
      });
      await testApp.close();
    });

    it('applies default page + page_size + sortBy + sortDir when omitted', async () => {
      const { stubs, listLinks } = buildStubs();
      const testApp = await buildApp(stubs);
      listLinks.mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 20 });

      const response = await testApp.inject({ method: 'GET', url: '/api/links' });
      expect(response.statusCode).toBe(200);
      expect(listLinks).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        search: undefined,
        sortBy: 'created_at',
        sortDir: 'desc',
      });
      await testApp.close();
    });

    it('passes search + sortBy + sortDir through to the use-case', async () => {
      const { stubs, listLinks } = buildStubs();
      const testApp = await buildApp(stubs);
      listLinks.mockResolvedValueOnce({ data: [], total: 0, page: 2, pageSize: 10 });

      const response = await testApp.inject({
        method: 'GET',
        url: '/api/links?search=foo&sortBy=slug&sortDir=asc&page=2&page_size=10',
      });
      expect(response.statusCode).toBe(200);
      expect(listLinks).toHaveBeenCalledWith({
        page: 2,
        pageSize: 10,
        search: 'foo',
        sortBy: 'slug',
        sortDir: 'asc',
      });
      await testApp.close();
    });

    it('returns 400 when querystring fails Zod validation (page_size > 100)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/links?page_size=9999',
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/links/:id', () => {
    const id = '00000000-0000-0000-0000-000000000099';

    it('returns 204 on successful soft-delete', async () => {
      const { stubs, deleteLink } = buildStubs();
      const testApp = await buildApp(stubs);
      deleteLink.mockResolvedValueOnce(undefined);

      const response = await testApp.inject({
        method: 'DELETE',
        url: `/api/links/${id}`,
      });
      expect(response.statusCode).toBe(204);
      expect(deleteLink).toHaveBeenCalledWith({ id });
      await testApp.close();
    });

    it('returns 204 on idempotent re-delete (use-case returns void, not throw)', async () => {
      const { stubs, deleteLink } = buildStubs();
      const testApp = await buildApp(stubs);
      // Per DeleteLinkUseCase, already-deleted links return without
      // throwing (idempotent). The route always returns 204.
      deleteLink.mockResolvedValueOnce(undefined);

      const response = await testApp.inject({
        method: 'DELETE',
        url: `/api/links/${id}`,
      });
      expect(response.statusCode).toBe(204);
      await testApp.close();
    });

    it('returns 404 + problem-details on LinkNotFoundError', async () => {
      const { stubs, deleteLink } = buildStubs();
      const testApp = await buildApp(stubs);
      deleteLink.mockRejectedValueOnce(new LinkNotFoundError(id));

      const response = await testApp.inject({
        method: 'DELETE',
        url: `/api/links/${id}`,
      });
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.status).toBe(404);
      expect(body.title).toBe('Link not found');
      expect(body.detail).toBe('El enlace no existe');
      await testApp.close();
    });
  });

  describe('content-type (RFC 7807)', () => {
    // All problem-details responses MUST use the spec-locked
    // content-type so RFC 7807 clients (and the FE's `apiClient`)
    // can detect the response shape via standard content negotiation.
    it('POST validation failure uses application/problem+json', async () => {
      const { stubs } = buildStubs();
      const localApp = await buildApp(stubs);
      const response = await localApp.inject({
        method: 'POST',
        url: '/api/links',
        payload: { original_url: 'not-a-url' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      await localApp.close();
    });

    it('GET validation failure uses application/problem+json', async () => {
      const { stubs } = buildStubs();
      const localApp = await buildApp(stubs);
      const response = await localApp.inject({
        method: 'GET',
        url: '/api/links?page_size=999',
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      await localApp.close();
    });

    it('domain error responses use application/problem+json', async () => {
      // The use-case throws a 404 — the route catches it via the
      // error-mapper and replies with the problem-details body +
      // content-type.
      const { stubs, deleteLink } = buildStubs();
      const localApp = await buildApp(stubs);
      deleteLink.mockRejectedValueOnce(new LinkNotFoundError('abc'));
      const response = await localApp.inject({
        method: 'DELETE',
        url: '/api/links/00000000-0000-0000-0000-000000000099',
      });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      await localApp.close();
    });
  });
});
