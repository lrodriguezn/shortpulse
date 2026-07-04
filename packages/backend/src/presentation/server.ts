/**
 * Server entrypoint — `buildApp` and `startServer`.
 *
 * `buildApp(container)`:
 *  - Constructs a Fastify instance.
 *  - Registers the route plugins (links, redirect, analytics, health)
 *    in the order required by the spec (reserved routes BEFORE
 *    the redirect catch-all).
 *  - Registers the static plugin (serves the built SPA + the SPA
 *    fallback via `setNotFoundHandler`). When the frontend `dist/`
 *    directory is missing (dev mode without a build) the plugin
 *    silently skips and only the API is served.
 *  - Sets up the production error handler — domain errors thrown
 *    by use-cases are mapped to RFC 7807 problem-details responses
 *    via the `error-mapper` (anywhere they aren't already mapped
 *    inline).
 *  - Returns the configured instance. Tests use `app.inject()` to
 *    exercise it without binding a TCP port.
 *
 * `startServer()`:
 *  - Reads `PORT` and `BASE_URL` from `process.env`.
 *  - Builds a Drizzle client + container.
 *  - Calls `buildApp(container)` and then `app.listen()`.
 *  - Returns `{ server, close }` so the caller can await
 *    graceful shutdown.
 *
 * Reserved routes (`/api/*`, `/health`, `/analytics`) are registered
 * before the redirect catch-all so a request to `GET /analytics`
 * never reaches the slug handler (spec links scenario: "Reserved
 * route does not redirect"). The redirect route ALSO delegates
 * reserved SPA slugs (`/analytics`, `/favicon`, …) to the not-found
 * handler so the SPA can serve them — see `redirect-route.ts`.
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §1 (single
 *    container serves SPA + API) + §5 (API contract) + §11 (Docker
 *    entrypoint)
 */
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';

import { createContainer, type Container } from '../infrastructure/container.js';
import { createDb } from '../db/client.js';

import { healthRoute, type HealthDbProbe } from './health-route.js';
import { linksRoutes } from './links-routes.js';
import { analyticsRoutes } from './analytics-routes.js';
import { redirectRoute } from './redirect-route.js';
import { registerStaticPlugin } from './static-plugin.js';
import { mapDomainError } from './error-mapper.js';

export interface BuildAppOptions {
  /** Optional logger flag — disabled by default in tests. */
  logger?: boolean;
  /**
   * Absolute path to the built frontend `dist/`. Overrides
   * `FRONTEND_DIST_PATH` when set; the plugin otherwise falls
   * back to `<cwd>/frontend/dist` and silently skips registration
   * if the path does not exist.
   */
  frontendDistPath?: string;
}

/**
 * Build a fully-configured Fastify instance from a DI container.
 *
 * The container MUST be already constructed (`createContainer()`);
 * this function only wires the presentation layer. The same
 * container can be used to build multiple apps (e.g. integration
 * tests that want a fresh app per test).
 */
export async function buildApp(
  container: Container,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  // Top-level error handler — catches anything that escapes the
  // route-specific try/catches (e.g. uncaught exceptions in hooks).
  // Domain errors are mapped via the error-mapper; non-domain
  // errors bucket to 500.
  //
  // The response uses the RFC 7807 content-type
  // `application/problem+json` (design §5). Fastify's `reply.send`
  // would default to `application/json` for the problem-details
  // body; we override the content-type so RFC 7807 clients can
  // detect the response shape via the standard content negotiation.
  app.setErrorHandler((error, _request, reply) => {
    const mapped = mapDomainError(error);
    return reply
      .code(mapped.statusCode)
      .header('Content-Type', 'application/problem+json')
      .send(mapped.problem);
  });

  // Wire the DB probe for /health: `SELECT 1` via Drizzle. The
  // query is lazy on the postgres.js driver so this does not
  // open a connection at boot — it runs only when /health is hit.
  const ping: HealthDbProbe = async () => {
    // Use a raw drizzle execute to keep the probe self-contained
    // and not coupled to a specific repo contract. The `db` is
    // attached to the container in `startServer()`; we read it
    // here via a side-channel so the container's public surface
    // (the 7 use-cases + adapters) stays stable.
    const db = (container as unknown as { _db?: unknown })._db as
      { execute: (q: ReturnType<typeof sql>) => Promise<unknown> } | undefined;
    if (!db || typeof db.execute !== 'function') {
      throw new Error('health probe: no db available');
    }
    await db.execute(sql`SELECT 1`);
  };

  // Register the route plugins. Order matters: reserved routes
  // (`/api/links`, `/api/analytics/*`, `/health`) MUST be
  // registered before the `/:slug` catch-all so Fastify's route
  // matcher picks the most specific path first.
  await app.register(linksRoutes, {
    useCases: container.useCases,
    baseUrl: resolveBaseUrl(),
  });
  await app.register(analyticsRoutes, { useCases: container.useCases });
  await app.register(healthRoute, { ping });
  await app.register(redirectRoute, { useCases: container.useCases });

  // Static plugin LAST — its `setNotFoundHandler` is the SPA
  // fallback (serves `index.html` for unmatched non-API paths).
  // The plugin silently skips when the dist directory is missing
  // (e.g. dev mode without a built SPA), so this is always safe.
  await registerStaticPlugin(app, {
    ...(options.frontendDistPath !== undefined ? { distPath: options.frontendDistPath } : {}),
  });

  return app;
}

/** Production boot — bind to PORT and serve until SIGTERM. */
export interface StartServerResult {
  server: FastifyInstance;
  close: () => Promise<void>;
}

export async function startServer(): Promise<StartServerResult> {
  const port = Number(process.env['PORT'] ?? '3000');
  const baseUrl = resolveBaseUrl();
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    throw new Error('startServer: DATABASE_URL env var is required');
  }

  const db = createDb({ connectionString: dbUrl });
  const container = createContainer({ db, baseUrl });
  // Expose the raw Drizzle db on the container (for the health
  // probe) — we attach via a side channel since `Container` is
  // a stable seam.
  (container as unknown as { _db: ShortPulseDbShape })._db = db;

  const server = await buildApp(container, {
    logger: true,
    ...(process.env['FRONTEND_DIST_PATH'] !== undefined
      ? { frontendDistPath: process.env['FRONTEND_DIST_PATH'] }
      : {}),
  });
  await server.listen({ port, host: '0.0.0.0' });

  const close = async (): Promise<void> => {
    await server.close();
  };

  return { server, close };
}

/**
 * Read `BASE_URL` from env, defaulting to `http://localhost:${PORT}`.
 * The presentation layer uses this to compose `short_url` in link
 * responses (the use-case is given the same value via the DI bag).
 */
function resolveBaseUrl(): string {
  return process.env['BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3000'}`;
}

/** Local type alias for the raw Drizzle db (avoids importing the
 *  full client type into the public surface). */
type ShortPulseDbShape = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
