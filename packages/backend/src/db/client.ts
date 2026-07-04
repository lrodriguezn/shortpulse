/**
 * Database client factory for ShortPulse.
 *
 * The whole app talks to PostgreSQL through a single Drizzle instance per
 * process. The factory takes a connection string explicitly so tests can
 * inject any URL (real DB, testcontainers, or an unreachable one — the
 * factory is sync and doesn't connect until the first query).
 *
 * A module-level singleton `db` is exported for production use; it reads
 * `process.env.DATABASE_URL` lazily (at first access) so a misconfigured
 * env doesn't crash the process on import. Callers that need a different
 * connection (e.g. integration tests) should use `createDb()` directly.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.js';

/**
 * Drizzle instance with the ShortPulse schema attached. We import the
 * factory's return type so callers can `Parameters<typeof createDb>[0]`
 * if they need a strongly-typed config shape.
 */
export type ShortPulseDb = ReturnType<typeof createDb>;

/**
 * Create a Drizzle instance backed by a fresh postgres.js client.
 *
 * Note: this does NOT actually open a connection. The postgres.js driver
 * is lazy — it only contacts the server on the first query. This makes
 * the factory safe to call at module load time without a live DB.
 */
export function createDb(config: { connectionString: string }) {
  const client = postgres(config.connectionString, {
    // ShortPulse is a single-process app; default to no pool ceiling beyond
    // what postgres.js sets (10). Keep `prepare: false` (default) for
    // compatibility with PgBouncer transaction pooling in production.
    max: 10,
  });
  return drizzle(client, { schema });
}

/**
 * Process-wide Drizzle singleton. Reads `DATABASE_URL` on first access.
 *
 * Throws if `DATABASE_URL` is unset. The Docker entrypoint sets this
 * env var (docker-compose.yml); the CI test environment also sets it.
 */
export const db: ShortPulseDb = (() => {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    // We intentionally throw here, but defer evaluation: the singleton is
    // created at import time. To allow import without a configured DB
    // (e.g. in `tsc --noEmit`), we expose the error via a Proxy that
    // throws on first property access. This keeps `import { db } from ...`
    // working in typecheck while still failing loudly at runtime.
    return new Proxy({} as ShortPulseDb, {
      get() {
        throw new Error(
          'db: DATABASE_URL is not set. Configure it in .env (see .env.example) ' +
            'or pass an explicit connectionString to createDb().',
        );
      },
    });
  }
  return createDb({ connectionString });
})();
