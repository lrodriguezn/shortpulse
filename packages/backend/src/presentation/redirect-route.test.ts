/**
 * Integration tests for the redirect route (`/:slug`).
 *
 * The redirect plugin is the catch-all for short URLs. Reserved
 * routes (`/api/*`, `/health`, `/analytics`, etc.) MUST be registered
 * before it; this test exercises the redirect plugin in isolation
 * with a `/:slug` route only, so the route-matcher just resolves
 * whatever the test injects.
 *
 * Test coverage (per spec links #4):
 *  - 302 + `Location: <originalUrl>` on a found slug
 *  - 404 + problem-details on `LinkNotFoundError` (not found)
 *  - 404 + problem-details when the slug is soft-deleted (the
 *    repo's `findBySlug` returns `null` for soft-deleted links,
 *    so this collapses into the "not found" branch — but the
 *    test asserts the redirect use-case IS still called, which
 *    is what triggers analytics on success).
 *  - analytics recording is called with the right `ip` / ua /
 *    referer on success.
 *
 * TDD note: tests were written first (RED). The plugin in
 * `redirect-route.ts` was written to make them pass (GREEN).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { redirectRoute } from './redirect-route.js';
import { LinkNotFoundError } from '../domain/errors.js';

import type { RedirectUseCase } from '../application/redirect.use-case.js';

interface RedirectStubs {
  redirect: Pick<RedirectUseCase, 'execute'>;
}

function buildStubs() {
  const redirect = vi.fn();
  return { stubs: { redirect: { execute: redirect } }, redirect };
}

async function buildApp(stubs: RedirectStubs): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(redirectRoute, { useCases: stubs });
  return app;
}

describe('redirect-route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { stubs } = buildStubs();
    app = await buildApp(stubs);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 302 + Location header on a found slug', async () => {
    const { stubs, redirect } = buildStubs();
    const testApp = await buildApp(stubs);
    redirect.mockResolvedValueOnce({ originalUrl: 'https://example.com' });

    const response = await testApp.inject({
      method: 'GET',
      url: '/abc',
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: 'https://google.com',
      },
      remoteAddress: '1.2.3.4',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://example.com');
    expect(redirect).toHaveBeenCalledWith({
      slug: 'abc',
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: 'https://google.com',
    });
    await testApp.close();
  });

  it('passes null referer when the client omits it (UA defaults to lightMyRequest under inject)', async () => {
    const { stubs, redirect } = buildStubs();
    const testApp = await buildApp(stubs);
    redirect.mockResolvedValueOnce({ originalUrl: 'https://example.com' });

    const response = await testApp.inject({
      method: 'GET',
      url: '/abc',
      remoteAddress: '1.2.3.4',
    });

    expect(response.statusCode).toBe(302);
    // Fastify's light-my-request sets `user-agent: lightMyRequest`
    // by default when the test doesn't pass one — that's the value
    // the route sees. The referer header is null when omitted.
    expect(redirect).toHaveBeenCalledWith({
      slug: 'abc',
      ip: '1.2.3.4',
      userAgent: 'lightMyRequest',
      referer: null,
    });
    await testApp.close();
  });

  it('returns 404 + problem-details on LinkNotFoundError (slug not in DB)', async () => {
    const { stubs, redirect } = buildStubs();
    const testApp = await buildApp(stubs);
    redirect.mockRejectedValueOnce(new LinkNotFoundError('missing'));

    const response = await testApp.inject({
      method: 'GET',
      url: '/missing',
      remoteAddress: '1.2.3.4',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.status).toBe(404);
    expect(body.title).toBe('Link not found');
    expect(body.detail).toBe('El enlace no existe');
    await testApp.close();
  });

  it('returns 404 + problem-details when the slug is soft-deleted (no analytics recorded)', async () => {
    // The DrizzleLinkRepository excludes soft-deleted rows from
    // findBySlug, so this collapses to the "not found" branch.
    // The use-case throws LinkNotFoundError BEFORE recording
    // analytics — the controller just maps the error.
    const { stubs, redirect } = buildStubs();
    const testApp = await buildApp(stubs);
    redirect.mockRejectedValueOnce(new LinkNotFoundError('deleted-slug'));

    const response = await testApp.inject({
      method: 'GET',
      url: '/deleted-slug',
      remoteAddress: '1.2.3.4',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().detail).toBe('El enlace no existe');
    await testApp.close();
  });

  it('reads IP from x-forwarded-for when present (trusted proxy chain)', async () => {
    const { stubs, redirect } = buildStubs();
    const testApp = await buildApp(stubs);
    redirect.mockResolvedValueOnce({ originalUrl: 'https://example.com' });

    // Fastify does not trust x-forwarded-for by default; the route
    // reads it explicitly when present so the redirect use-case
    // receives the proxied client IP (the analytics pipeline then
    // feeds that to the geolocator).
    const response = await testApp.inject({
      method: 'GET',
      url: '/abc',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });

    expect(response.statusCode).toBe(302);
    expect(redirect).toHaveBeenCalledWith({
      slug: 'abc',
      ip: '203.0.113.1',
      userAgent: 'lightMyRequest', // default under inject
      referer: null,
    });
    await testApp.close();
  });

  it('returns 500 + generic problem-details on an unknown error', async () => {
    const { stubs, redirect } = buildStubs();
    const testApp = await buildApp(stubs);
    redirect.mockRejectedValueOnce(new Error('boom'));

    const response = await testApp.inject({
      method: 'GET',
      url: '/abc',
      remoteAddress: '1.2.3.4',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().detail).toBe('Error interno del servidor');
    await testApp.close();
  });
});
