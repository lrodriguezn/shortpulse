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
 * **SPA paths and invalid slugs** (e.g. `/analytics`, `/favicon`,
 * `/My-Link`, `/ab`, or the root `/`) are NOT handled by this route.
 * A `preHandler` hook validates the slug against the spec-locked
 * `CUSTOM_SLUG_REGEX` and the `RESERVED_ROUTES` set, delegating to
 * the not-found handler via `reply.callNotFound()` when the path
 * is not a valid redirect target. This is what makes the
 * single-container SPA + API architecture work (design §1 + ADR-003):
 * the FE's TanStack Router takes over for everything that isn't a
 * valid short URL.
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
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6 + ADR-002 + §11
 */
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { CUSTOM_SLUG_REGEX, RESERVED_ROUTES } from '@shortpulse/shared';

import { mapDomainError } from './error-mapper.js';

import type { RedirectUseCase } from '../application/redirect.use-case.js';

export interface RedirectRouteOptions {
  useCases: {
    redirect: Pick<RedirectUseCase, 'execute'>;
  };
}

/**
 * `Set` for O(1) case-folded reserved-route lookups. Built once at
 * module load — the reserved set is static (per design §8 + the
 * shared package's `constants.ts`).
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set(
  RESERVED_ROUTES.map((r) => r.toLowerCase()).filter((r) => r.length > 0),
);

/**
 * `preHandler` hook that delegates SPA paths and invalid slugs to
 * Fastify's not-found handler. The hook runs AFTER the route is
 * matched but BEFORE the handler, so the redirect use case is
 * NEVER invoked for these paths.
 *
 * Returns `true` to continue (slug is a valid, non-reserved
 * redirect target) or delegates to the not-found handler.
 */
function validateSlugOrDelegateNotFound(slug: string, reply: FastifyReply): boolean {
  // Slug must match the spec-locked custom-slug regex
  // (3-20 chars, lowercase alphanumeric + hyphens, no
  // leading/trailing hyphens). Paths that don't match (e.g. `/ab`,
  // `/My-Link`, `/`, `/favicon.ico`) are NOT redirect targets.
  if (!CUSTOM_SLUG_REGEX.test(slug)) {
    reply.callNotFound();
    return false;
  }
  // Reserved SPA paths (e.g. `/analytics`, `/favicon`) are not
  // real links — the FE router handles them.
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    reply.callNotFound();
    return false;
  }
  return true;
}

export const redirectRoute: FastifyPluginAsync<RedirectRouteOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const { useCases } = options;

  app.get<{ Params: { slug: string } }>(
    '/:slug',
    {
      preHandler: (request, reply, done) => {
        if (validateSlugOrDelegateNotFound(request.params.slug, reply)) {
          done();
        }
      },
    },
    async (request, reply) => {
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
        return reply
          .code(mapped.statusCode)
          .header('Content-Type', 'application/problem+json')
          .send(mapped.problem);
      }
    },
  );
};
