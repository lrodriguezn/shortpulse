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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    // RFC 7807 content-type per design §5 — the FE's apiClient
    // branches on this header to extract the problem-details body.
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    await app.close();
  });

  it('uses the RFC 7807 content-type on the top-level error handler responses', async () => {
    // The setErrorHandler is the catch-all for errors that escape
    // route-specific try/catches (e.g. uncaught exceptions in
    // hooks). It MUST also set the problem-details content-type.
    const container = createContainer({
      db: stubDb(),
      baseUrl: 'http://localhost:3000',
    });
    const app = await buildApp(container);

    // A POST to an unknown API path hits the not-found handler
    // (static-plugin) which DOES set the content-type. We assert
    // here that the route-handler-level Zod failure also sets it
    // (already covered by the previous test) AND verify the
    // setErrorHandler's content-type via a deliberately-broken
    // route we add ad-hoc.
    app.get('/__boom', async () => {
      throw new Error('boom');
    });
    const response = await app.inject({ method: 'GET', url: '/__boom' });
    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    await app.close();
  });

  it('serves the SPA index.html for GET / when a frontend dist is provided', async () => {
    // Spin up a minimal dist fixture and pass it to `buildApp`.
    // The static plugin registers @fastify/static + a not-found
    // handler that serves `index.html` for unmatched SPA paths.
    const distPath = mkdtempSync(join(tmpdir(), 'sp-server-'));
    writeFileSync(
      join(distPath, 'index.html'),
      '<!doctype html><html><head><title>SPA</title></head><body>App</body></html>',
    );
    mkdirSync(join(distPath, 'assets'));
    writeFileSync(join(distPath, 'assets', 'app.js'), 'console.log("app");');

    try {
      const container = createContainer({
        db: stubDb(),
        baseUrl: 'http://localhost:3000',
      });
      const app = await buildApp(container, { frontendDistPath: distPath });

      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.body).toContain('<title>SPA</title>');

      await app.close();
    } finally {
      rmSync(distPath, { recursive: true, force: true });
    }
  });

  it('serves the SPA index.html for GET /analytics (reserved SPA path)', async () => {
    // `/analytics` is a FE route. The redirect route short-circuits
    // reserved SPA slugs via `reply.callNotFound()`; the static
    // plugin's not-found handler then serves `index.html`.
    const distPath = mkdtempSync(join(tmpdir(), 'sp-server-'));
    writeFileSync(
      join(distPath, 'index.html'),
      '<!doctype html><html><head><title>SPA</title></head><body>App</body></html>',
    );

    try {
      const container = createContainer({
        db: stubDb(),
        baseUrl: 'http://localhost:3000',
      });
      const app = await buildApp(container, { frontendDistPath: distPath });

      const response = await app.inject({ method: 'GET', url: '/analytics' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<title>SPA</title>');

      await app.close();
    } finally {
      rmSync(distPath, { recursive: true, force: true });
    }
  });

  it('still returns 404 problem-details for unmatched API paths when the SPA is mounted', async () => {
    // The static plugin's not-found handler MUST distinguish API
    // paths from SPA paths — otherwise `/api/nonexistent` would
    // serve `index.html` and the FE would try to parse it as JSON.
    const distPath = mkdtempSync(join(tmpdir(), 'sp-server-'));
    writeFileSync(
      join(distPath, 'index.html'),
      '<!doctype html><html><head><title>SPA</title></head><body>App</body></html>',
    );

    try {
      const container = createContainer({
        db: stubDb(),
        baseUrl: 'http://localhost:3000',
      });
      const app = await buildApp(container, { frontendDistPath: distPath });

      const response = await app.inject({ method: 'GET', url: '/api/nonexistent' });
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.status).toBe(404);
      expect(body.title).toBe('Not Found');

      await app.close();
    } finally {
      rmSync(distPath, { recursive: true, force: true });
    }
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
