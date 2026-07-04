/**
 * Health route — `GET /health`.
 *
 * Public liveness/readiness probe used by the Docker HEALTHCHECK
 * (design §11) and Dokploy's deploy verification. Pings the
 * database with `SELECT 1` and returns:
 *  - 200 `{status: 'ok', db: 'connected'}` when reachable
 *  - 503 `{status: 'degraded', db: 'disconnected'}` when not
 *
 * The DB probe is injected (not coupled to a specific driver) so
 * the test can run without a real Postgres connection. In
 * production, `buildApp()` wires `db.execute(sql\`SELECT 1\`)`
 * as the probe.
 *
 * Spec references:
 *  - `openspec/specs/health/spec.md` requirement #1
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 endpoint #8,
 *    §11 Docker HEALTHCHECK
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Database probe contract. Resolves on a successful `SELECT 1`
 * round-trip; rejects (or throws synchronously) on any failure.
 *
 * Matches the shape `db.execute(sql\`SELECT 1\`)` produces on
 * Drizzle / postgres.js (which returns a row iterator; we just
 * need it to NOT throw).
 */
export type HealthDbProbe = () => Promise<unknown>;

export interface HealthRouteOptions {
  /** DB probe — typically `db.execute(sql\`SELECT 1\`)` in production. */
  ping: HealthDbProbe;
}

export const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const { ping } = options;

  app.get('/health', async (_request, reply) => {
    try {
      await ping();
      return reply.code(200).send({ status: 'ok', db: 'connected' });
    } catch {
      return reply.code(503).send({ status: 'degraded', db: 'disconnected' });
    }
  });
};
