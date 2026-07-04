/**
 * `links-routes` — Fastify plugin for the `/api/links` endpoints.
 *
 * Mounted on `/api/links` (the Fastify registration prefix is set in
 * the consumer — the routes use the absolute paths below). Exposes:
 *  - `POST   /api/links`         — create
 *  - `GET    /api/links`         — list (paginated, filterable)
 *  - `DELETE /api/links/:id`     — soft-delete
 *
 * The plugin is a thin adapter over the application-layer use-cases:
 *  1. Validate the request with the shared Zod schemas
 *     (`createLinkSchema`, `listLinksQuerySchema`).
 *  2. Call the corresponding use-case from the injected `useCases` bag.
 *  3. Compose the API response shape (snake_case + `short_url`).
 *  4. On domain error, delegate to `error-mapper` and reply with the
 *     RFC 7807 problem-details body.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #2, #3
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { createLinkSchema, listLinksQuerySchema } from '@shortpulse/shared';

import type { CreateLinkUseCase } from '../application/create-link.use-case.js';
import type { ListLinksUseCase } from '../application/list-links.use-case.js';
import type { DeleteLinkUseCase } from '../application/delete-link.use-case.js';
import { mapDomainError } from './error-mapper.js';

export interface LinksRoutesOptions {
  /** Use-cases injected by `buildApp()` from the DI container. */
  useCases: {
    createLink: Pick<CreateLinkUseCase, 'execute'>;
    listLinks: Pick<ListLinksUseCase, 'execute'>;
    deleteLink: Pick<DeleteLinkUseCase, 'execute'>;
  };
  /**
   * Base URL used to compose `short_url` in responses. Production:
   * the `BASE_URL` env var (no trailing slash).
   */
  baseUrl: string;
}

/**
 * Translate a `CreateLinkOutput` (camelCase, Date) to the API-shaped
 * `linkResponseSchema` body (snake_case, ISO datetime).
 */
function toCreateResponse(output: {
  id: string;
  originalUrl: string;
  slug: string;
  shortUrl: string;
  createdAt: Date;
  clickCount: number;
}): {
  id: string;
  original_url: string;
  slug: string;
  short_url: string;
  created_at: string;
  click_count: number;
  deleted_at: null;
} {
  return {
    id: output.id,
    original_url: output.originalUrl,
    slug: output.slug,
    short_url: output.shortUrl,
    created_at: output.createdAt.toISOString(),
    click_count: output.clickCount,
    deleted_at: null,
  };
}

export const linksRoutes: FastifyPluginAsync<LinksRoutesOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const { useCases, baseUrl } = options;

  // POST /api/links — create
  app.post('/api/links', async (request, reply) => {
    const parsed = createLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: parsed.error.issues[0]?.message ?? 'Invalid request body',
      });
    }
    try {
      const result = await useCases.createLink.execute({
        originalUrl: parsed.data.original_url,
        ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
        baseUrl,
      });
      return reply.code(201).send(toCreateResponse(result));
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply.code(mapped.statusCode).send(mapped.problem);
    }
  });

  // GET /api/links — list (paginated, filterable)
  app.get('/api/links', async (request, reply) => {
    const parsed = listLinksQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: parsed.error.issues[0]?.message ?? 'Invalid querystring',
      });
    }
    try {
      const query = parsed.data;
      const result = await useCases.listLinks.execute({
        page: query.page,
        pageSize: query.page_size,
        ...(query.search !== undefined ? { search: query.search } : {}),
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      });
      return reply.code(200).send({
        data: result.data.map((row) => ({
          id: row.id,
          original_url: row.originalUrl,
          slug: row.slug,
          short_url: `${baseUrl}/${row.slug}`,
          created_at: row.createdAt.toISOString(),
          click_count: row.clickCount,
          deleted_at: null,
        })),
        total: result.total,
        page: result.page,
        page_size: result.pageSize,
      });
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply.code(mapped.statusCode).send(mapped.problem);
    }
  });

  // DELETE /api/links/:id — soft-delete (idempotent: 204 on both first
  // delete and re-delete; 404 on a non-existent id).
  app.delete<{ Params: { id: string } }>('/api/links/:id', async (request, reply) => {
    try {
      await useCases.deleteLink.execute({ id: request.params.id });
      return reply.code(204).send();
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply.code(mapped.statusCode).send(mapped.problem);
    }
  });
};
