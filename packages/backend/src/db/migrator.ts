/**
 * Drizzle migration runner for ShortPulse.
 *
 * Called by the Docker entrypoint (`docker/entrypoint.sh`) before the
 * Fastify app boots. Idempotent — Drizzle tracks applied migrations in
 * the `__drizzle_migrations` table.
 *
 * Usage:
 *   await runMigrations({ connectionString: process.env.DATABASE_URL! });
 *
 * The default `migrationsFolder` is the `drizzle/` directory at the
 * package root (alongside `package.json`), which is where
 * `drizzle-kit generate` writes versioned SQL.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { schema } from './schema.js';

/** Absolute path to the generated `drizzle/` folder. */
const DEFAULT_MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'drizzle',
);

export interface MigratorConfig {
  /** Postgres connection string, e.g. `postgres://user:pass@host:5432/db`. */
  connectionString: string;
  /**
   * Folder containing versioned migration SQL files. Defaults to the
   * `drizzle/` directory at the package root.
   */
  migrationsFolder?: string;
}

/**
 * Apply all pending migrations to the target database.
 *
 * Opens a short-lived postgres.js connection, runs the migrations, then
 * closes the connection. Throws on the first error (caller is expected
 * to fail-fast and surface a 500 / restart the container).
 */
export async function runMigrations(config: MigratorConfig): Promise<void> {
  const migrationsFolder = config.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;

  // Use a single-connection client. Migrations must run on one connection
  // to keep the `__drizzle_migrations` table state coherent. postgres.js
  // exposes `max: 1` for that.
  const client = postgres(config.connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    // Always close the connection, even on failure. The entrypoint will
    // exit non-zero on the propagated error and Docker will restart.
    await client.end();
  }
}
