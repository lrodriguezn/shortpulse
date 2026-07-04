/**
 * Integration tests for the static plugin (`@fastify/static` + SPA fallback).
 *
 * The plugin serves the built frontend from `<distPath>/index.html` and
 * static assets, and wires a `setNotFoundHandler` that:
 *  - returns 404 problem-details for API paths or non-GET/HEAD methods
 *  - serves `index.html` for SPA routes (e.g. `/analytics`, `/`)
 *  - returns 404 problem-details for missing static assets (paths with
 *    a file extension that don't exist in the dist)
 *
 * The plugin is environment-aware: it only registers when the dist
 * path exists on disk. Tests construct a temp directory with a fake
 * `index.html` and `assets/app.js` to exercise the happy paths.
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §1 (single
 *    container serves SPA + API) + §11 (Docker)
 *  - `openspec/changes/add-shortpulse-app/tasks.md` Phase 10.1
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerStaticPlugin } from './static-plugin.js';

describe('static-plugin', () => {
  let distPath: string;
  let app: FastifyInstance;

  beforeEach(() => {
    // Build a minimal dist fixture: index.html + assets/app.js
    distPath = mkdtempSync(join(tmpdir(), 'sp-static-'));
    writeFileSync(
      join(distPath, 'index.html'),
      '<!doctype html><html><head><title>SPA</title></head><body>App</body></html>',
    );
    mkdirSync(join(distPath, 'assets'));
    writeFileSync(join(distPath, 'assets', 'app.js'), 'console.log("app");');
  });

  afterEach(async () => {
    if (app) await app.close();
    rmSync(distPath, { recursive: true, force: true });
  });

  it('serves index.html for GET / (SPA root)', async () => {
    app = Fastify({ logger: false });
    await registerStaticPlugin(app, { distPath });

    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.body).toContain('<title>SPA</title>');
  });

  it('serves static assets from the dist root (assets/app.js)', async () => {
    app = Fastify({ logger: false });
    await registerStaticPlugin(app, { distPath });

    const response = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('console.log("app");');
  });

  it('serves index.html for unknown SPA routes (SPA fallback)', async () => {
    app = Fastify({ logger: false });
    await registerStaticPlugin(app, { distPath });

    // /analytics is a SPA route, not a static file
    const response = await app.inject({ method: 'GET', url: '/analytics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.body).toContain('<title>SPA</title>');
  });

  it('returns 404 problem-details for unknown API paths', async () => {
    app = Fastify({ logger: false });
    await registerStaticPlugin(app, { distPath });

    const response = await app.inject({ method: 'GET', url: '/api/nonexistent' });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.status).toBe(404);
    expect(body.title).toBe('Not Found');
  });

  it('returns 404 problem-details for /health (wrong method)', async () => {
    app = Fastify({ logger: false });
    await registerStaticPlugin(app, { distPath });

    // /health exists conceptually but POST is not a valid method.
    // The not-found handler classifies it as an API path → 404.
    const response = await app.inject({ method: 'POST', url: '/health' });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.status).toBe(404);
  });

  it('returns 404 problem-details for missing static assets (file extension)', async () => {
    app = Fastify({ logger: false });
    await registerStaticPlugin(app, { distPath });

    // A non-existent JS file — the not-found handler classifies it
    // as a static asset (has a `.js` extension) → 404 problem-details,
    // NOT the SPA fallback. Serving index.html for a missing JS
    // would be a footgun.
    const response = await app.inject({ method: 'GET', url: '/assets/missing.js' });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.status).toBe(404);
  });

  it('skips registration when the dist path does not exist (dev mode)', async () => {
    app = Fastify({ logger: false });
    // Point at a non-existent path — the plugin should silently
    // skip registration without throwing.
    await registerStaticPlugin(app, { distPath: '/nonexistent/path/that/does/not/exist' });

    // A request to / falls through to Fastify's default 404 (no
    // not-found handler was set because the plugin skipped).
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
  });

  it('resolves the dist path from FRONTEND_DIST_PATH env when option omitted', async () => {
    const previous = process.env['FRONTEND_DIST_PATH'];
    process.env['FRONTEND_DIST_PATH'] = distPath;
    try {
      app = Fastify({ logger: false });
      await registerStaticPlugin(app);

      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<title>SPA</title>');
    } finally {
      if (previous === undefined) {
        delete process.env['FRONTEND_DIST_PATH'];
      } else {
        process.env['FRONTEND_DIST_PATH'] = previous;
      }
    }
  });
});
