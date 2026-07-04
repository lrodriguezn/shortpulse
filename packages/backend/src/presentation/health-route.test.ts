/**
 * Integration tests for the `health` route.
 *
 * `GET /health` is a public liveness/readiness probe used by the
 * Docker HEALTHCHECK and the Dokploy deploy. It runs `SELECT 1`
 * against the database and returns:
 *  - 200 `{status: 'ok', db: 'connected'}` when the DB is reachable
 *  - 503 `{status: 'degraded', db: 'disconnected'}` when not
 *
 * Tests inject a mocked `db.execute` shim — we don't need a real
 * postgres connection because the route's contract is "DB returns
 * truthy → connected; throws / rejects → disconnected".
 *
 * Spec references:
 *  - `openspec/specs/health/spec.md` requirement #1 + scenarios
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 endpoint #8
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { healthRoute, type HealthDbProbe } from './health-route.js';

interface DbStubs {
  ping: HealthDbProbe;
}

function buildStubs() {
  const ping = vi.fn();
  return { stubs: { ping }, ping };
}

async function buildApp(stubs: DbStubs): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(healthRoute, { ping: stubs.ping });
  return app;
}

describe('health-route', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('returns 200 + {status:"ok", db:"connected"} when the DB is reachable', async () => {
    const { stubs, ping } = buildStubs();
    ping.mockResolvedValueOnce(undefined);
    const app = await buildApp(stubs);

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', db: 'connected' });
    expect(ping).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns 503 + {status:"degraded", db:"disconnected"} when the DB ping rejects', async () => {
    const { stubs, ping } = buildStubs();
    ping.mockRejectedValueOnce(new Error('connection refused'));
    const app = await buildApp(stubs);

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', db: 'disconnected' });
    expect(ping).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns 503 when the DB ping throws synchronously', async () => {
    // Some Drizzle drivers throw on bad config rather than rejecting
    // the promise — the route handles both.
    const { stubs, ping } = buildStubs();
    ping.mockImplementationOnce(() => {
      throw new Error('sync error');
    });
    const app = await buildApp(stubs);

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', db: 'disconnected' });
    await app.close();
  });
});
