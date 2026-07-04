/**
 * Redirect route — the catch-all `GET /:slug` handler.
 *
 * Resolves a short URL to its `originalUrl`, records a synchronous
 * analytics event (per design ADR-002), and replies 302 + `Location`.
 * On `LinkNotFoundError` (missing or soft-deleted slug) it replies
 * 404 with the spec-locked problem-details body.
 *
 * **Reserved routes** (api, health, analytics, …) are registered
 * BEFORE this plugin in `buildApp()`. Fastify matches the most
 * specific route first, so `GET /health` and `GET /api/links` never
 * reach this handler.
 *
 * IP resolution honours the `x-forwarded-for` header when present
 * (proxied deployments behind Dokploy / a reverse proxy). The header
 * is read verbatim — the trusted-proxy chain is configured at the
 * Fastify instance level when one is set up (out of scope for the
 * unit/integration tests; production deploy sets `trustProxy` in
 * the server entrypoint).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #4 (redirect)
 *  - `openspec/specs/analytics/spec.md` requirement #1 (event recording)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6 + ADR-002
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { mapDomainError } from './error-mapper.js';

import type { RedirectUseCase } from '../application/redirect.use-case.js';

export interface RedirectRouteOptions {
  useCases: {
    redirect: Pick<RedirectUseCase, 'execute'>;
  };
}

export const redirectRoute: FastifyPluginAsync<RedirectRouteOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const { useCases } = options;

  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const slug = request.params.slug;
    const userAgent = request.headers['user-agent'] ?? null;
    const referer = request.headers['referer'] ?? null;
    // Prefer the proxied client IP when present (Dokploy sets
    // x-forwarded-for). Fall back to Fastify's resolved `request.ip`
    // which uses the trusted-proxy chain when configured.
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip =
      typeof forwardedFor === 'string' && forwardedFor.length > 0
        ? forwardedFor.split(',')[0]!.trim()
        : request.ip;

    try {
      const { originalUrl } = await useCases.redirect.execute({
        slug,
        ip,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
        referer: typeof referer === 'string' ? referer : null,
      });
      return reply.code(302).header('Location', originalUrl).send();
    } catch (error) {
      const mapped = mapDomainError(error);
      return reply.code(mapped.statusCode).send(mapped.problem);
    }
  });
};
