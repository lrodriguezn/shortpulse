/**
 * `static-plugin` — serves the built frontend SPA + static assets from
 * the Fastify instance.
 *
 * This is the glue that makes the single-container architecture work
 * (design §1 + ADR-003): one Fastify process handles both the API
 * (`/api/*`, `/health`, `/:slug`) and the SPA (`/`, `/analytics`, all
 * other unmatched routes). The Docker image ships a single Node process
 * that serves everything on one port.
 *
 * Behaviour:
 *  - Registers `@fastify/static` with `root: <distPath>` so requests
 *    to files that exist on disk (e.g. `/assets/app.js`) are served
 *    directly via the static plugin's `reply.sendFile`.
 *  - Registers an app-level `setNotFoundHandler` that fires for any
 *    GET/HEAD that no other route matched:
 *      • `/api/*` or `/health` → 404 problem-details (real API 404).
 *      • path with a file extension (e.g. `/assets/missing.js`) → 404
 *        problem-details (static asset missing — NOT the SPA).
 *      • otherwise → `reply.sendFile('index.html')` (SPA fallback so
 *        the FE router can take over on `/analytics`, `/`, etc.).
 *  - POST/PUT/DELETE/PATCH unmatched → 404 problem-details.
 *
 * Env contract:
 *  - `FRONTEND_DIST_PATH` (optional, absolute path) — where to look
 *    for the built SPA. Overrides the `distPath` option.
 *  - When the resolved path does not exist on disk, the plugin
 *    silently skips registration. This keeps `pnpm dev` (where the
 *    SPA is served by Vite on a separate port) working without
 *    requiring a frontend build first.
 *
 * Reserved-route interplay:
 *  - The redirect route (`GET /:slug`) intercepts ALL single-segment
 *    paths. To prevent `/analytics` from triggering a use-case
 *    redirect (the slug `analytics` is not a real link), the redirect
 *    route itself short-circuits reserved slugs via
 *    `reply.callNotFound()` — which delegates to the not-found
 *    handler set HERE. The handler then serves `index.html`.
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §1 (single
 *    container serves SPA + API) + §11 (Docker)
 *  - `openspec/changes/add-shortpulse-app/tasks.md` Phase 10
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export interface StaticPluginOptions {
  /**
   * Absolute path to the frontend `dist/` directory. When omitted,
   * the plugin reads `FRONTEND_DIST_PATH` from `process.env`,
   * falling back to `<cwd>/frontend/dist`.
   */
  distPath?: string;
}

/**
 * Resolve the dist path. Returns `null` when the path does not
 * exist on disk — callers MUST check for null and skip registration
 * in that case (development mode without a built SPA).
 */
function resolveDistPath(override: string | undefined): string | null {
  const envPath = process.env['FRONTEND_DIST_PATH'];
  const candidate = override ?? envPath ?? resolve(process.cwd(), 'frontend', 'dist');
  return existsSync(candidate) ? candidate : null;
}

/**
 * Classify the request URL for the not-found handler.
 *
 * Returns:
 *  - `'api'` when the request is for an API/health route (real
 *    404 problem-details, never the SPA).
 *  - `'asset'` when the path has a file extension (likely a missing
 *    static asset — also a real 404, not the SPA).
 *  - `'spa'` for anything else (serve `index.html`).
 */
function classifyNotFound(url: string): 'api' | 'asset' | 'spa' {
  if (url.startsWith('/api/') || url === '/health' || url.startsWith('/health/')) {
    return 'api';
  }
  // A file extension in the last path segment marks a static asset
  // request. Paths like `/assets/missing.js` should 404 (problem-
  // details), not serve `index.html` — the browser would try to
  // parse HTML as JS.
  const lastSegment = url.split('?')[0]?.split('/').pop() ?? '';
  if (lastSegment.includes('.')) {
    return 'asset';
  }
  return 'spa';
}

export const staticPlugin: FastifyPluginAsync<StaticPluginOptions> = async (
  app: FastifyInstance,
  options,
) => {
  await registerStaticPlugin(app, options);
};

/**
 * Imperative registration entry point — exported separately so tests
 * and `buildApp` can register the plugin without going through
 * `app.register(staticPlugin, opts)` (which requires the plugin to
 * be encapsulated in its own context). Setting the not-found
 * handler at the app level is intentional: the redirect route's
 * `reply.callNotFound()` must reach this handler from a sibling
 * plugin, and an app-level handler is reachable from any context.
 */
export async function registerStaticPlugin(
  app: FastifyInstance,
  options: StaticPluginOptions = {},
): Promise<void> {
  const distPath = resolveDistPath(options.distPath);
  if (!distPath) {
    // Dev mode without a built SPA. Skip silently — the API still
    // works, the FE is served by Vite on a different port in dev.
    return;
  }

  // Provide `reply.sendFile()` for any file that exists under
  // `<distPath>`. We do NOT set `wildcard: true` — the not-found
  // handler below decides what to do with unmatched paths.
  await app.register(fastifyStatic, {
    root: distPath,
    prefix: '/',
    decorateReply: true,
    // Allow index.html to be served as the SPA fallback
    // (otherwise @fastify/static refuses to serve `.html` from
    // the root path under the default safe-dot setting).
    serveDotFiles: false,
  });

  // App-level not-found handler. Replaces the default empty
  // 404 with: problem-details for API/asset paths, `index.html`
  // for SPA routes.
  app.setNotFoundHandler((request, reply) => {
    // Non-GET/HEAD methods are always API-shaped 404s (the SPA
    // never issues POST/PUT/DELETE/PATCH against unknown paths).
    const method = request.method;
    const isRead = method === 'GET' || method === 'HEAD';
    if (!isRead) {
      return reply
        .code(404)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Route ${method} ${request.url} does not exist`,
        });
    }

    const kind = classifyNotFound(request.url);
    if (kind === 'api' || kind === 'asset') {
      return reply
        .code(404)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Route ${method} ${request.url} does not exist`,
        });
    }

    // SPA fallback: serve the built `index.html`. The FE's
    // TanStack Router takes over from here.
    return reply.sendFile('index.html');
  });
}
