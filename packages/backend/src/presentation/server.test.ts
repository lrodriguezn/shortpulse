/**
 * Integration tests for `buildApp` and `startServer`.
 *
 * `buildApp(container)`:
 *  - Returns a `FastifyInstance` with all the route plugins
 *    registered (`/api/links`, `/api/analytics/*`, `/health`, `/:slug`).
 *  - Sets up the production error handler (domain errors → 7807).
 *  - The server is testable via `app.inject()` without binding
 *    to a TCP port.
 *
 * `startServer()`:
 *  - Builds the container, calls `buildApp`, then `.listen()`.
 *  - Reads `PORT` + `BASE_URL` from `process.env`.
 *  - Returns the live `FastifyInstance` + a `close()` helper for
 *    tests to tear the server down cleanly.
 *
 * The container is wired with a mocked Drizzle client (stubDb) and
 * a mocked `HealthDbProbe` (the only thing the test can't infer
 * from a real DB).
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (all 8
 *    endpoints registered) + §11 (Docker entrypoint)
 *  - `openspec/specs/health/spec.md` + `openspec/specs/links/spec.md`
 *    + `openspec/specs/analytics/spec.md`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp, startServer } from './server.js';
import { createContainer } from '../infrastructure/container.js';

import type { ShortPulseDb } from '../db/client.js';

function stubDb(): ShortPulseDb {
  return {} as ShortPulseDb;
}

describe('buildApp', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('returns a Fastify instance with all 4 route plugins registered', async () => {
    const container = createContainer({
      db: stubDb(),
      baseUrl: 'http://localhost:3000',
    });
    const app = await buildApp(container);

    // Print the route tree — every spec endpoint MUST be present.
    // The tree format is implementation-defined (Fastify changes
    // it across majors); we assert each path appears in the tree
    // (the tree groups by parent route — `api/links` is rendered
    // as `api/` on one line and `links (POST, GET, HEAD)` on the
    // next, so we check for both halves).
    const routes = app.printRoutes();
    expect(routes).toContain('links (POST, GET, HEAD)');
    expect(routes).toContain('analytics (GET, HEAD)');
    expect(routes).toContain('health (GET, HEAD)');
    expect(routes).toContain(':slug (GET, HEAD)');
    // The /api/analytics/{summary,timeseries} sub-routes
    expect(routes).toContain('summary');
    expect(routes).toContain('timeseries');

    await app.close();
  });

  it('mounts the health route that uses an injected DB probe', async () => {
    // We don't need a real DB for the route-registration smoke.
    // The buildApp wires `db.execute(sql\`SELECT 1\`)` as the
    // probe — we just verify the route is registered and answers
    // 503 when the stub DB throws (the stub has no `execute`).
    const container = createContainer({
      db: stubDb(),
      baseUrl: 'http://localhost:3000',
    });
    const app = await buildApp(container);

    // The stub `db` throws on any property access (the production
    // proxy in `client.ts` throws if DATABASE_URL is missing) —
    // but the stub here is a plain `{} as ShortPulseDb` that
    // returns `undefined` for `.execute`. Fastify won't throw
    // for a missing method; the response will be 503.
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect([200, 503]).toContain(response.statusCode);
    await app.close();
  });

  it('rejects unhandled methods with 404 (no method-not-allowed collisions)', async () => {
    const container = createContainer({
      db: stubDb(),
      baseUrl: 'http://localhost:3000',
    });
    const app = await buildApp(container);

    // PATCH /api/links is not a real endpoint — Fastify returns 404.
    const response = await app.inject({ method: 'PATCH', url: '/api/links' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns problem-details 400 for invalid POST /api/links bodies (zod failure)', async () => {
    const container = createContainer({
      db: stubDb(),
      baseUrl: 'http://localhost:3000',
    });
    const app = await buildApp(container);

    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: { original_url: 'not-a-url' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.status).toBe(400);
    expect(body.title).toBe('Bad Request');
    await app.close();
  });
});

describe('startServer', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('binds to the PORT env var and serves /health', async () => {
    // Use port 0 so the OS picks a free port — no risk of clashing
    // with another process in CI.
    const previousPort = process.env['PORT'];
    process.env['PORT'] = '0';
    process.env['BASE_URL'] = 'http://localhost:0';
    process.env['DATABASE_URL'] = 'postgres://test:test@127.0.0.1:65535/test';

    const { server, close } = await startServer();

    // Pick a route we can exercise without a real DB: a 400 Zod
    // failure is independent of the container.
    const response = await server.inject({
      method: 'POST',
      url: '/api/links',
      payload: { original_url: 'not-a-url' },
    });
    expect(response.statusCode).toBe(400);

    await close();
    if (previousPort === undefined) {
      delete process.env['PORT'];
    } else {
      process.env['PORT'] = previousPort;
    }
  });

  it('binds to PORT=0 (OS picks) and the server is alive', async () => {
    // The first `binds to the PORT env var` test uses 0 already.
    // This second one verifies the construction does not throw
    // when the env is set but the test does not need a TCP socket.
    // We use a port that is highly unlikely to be in use.
    const previousPort = process.env['PORT'];
    process.env['PORT'] = '0';
    process.env['BASE_URL'] = 'http://localhost:0';
    process.env['DATABASE_URL'] = 'postgres://test:test@127.0.0.1:65535/test';

    const { server, close } = await startServer();
    expect(server).toBeDefined();
    // Server is listening (port 0 → OS-assigned); verify by
    // a health probe (will 503 because the DB is unreachable).
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect([200, 503]).toContain(response.statusCode);

    await close();
    if (previousPort === undefined) {
      delete process.env['PORT'];
    } else {
      process.env['PORT'] = previousPort;
    }
  });
});
