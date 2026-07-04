/**
 * ShortPulse backend — production entrypoint.
 *
 * Boots the Fastify server using the env-driven config:
 *  - `PORT` (default 3000) — TCP port
 *  - `BASE_URL` (default `http://localhost:${PORT}`) — used to
 *    compose `short_url` in link responses
 *  - `DATABASE_URL` (required) — postgres connection string
 *  - `GEOIP_DB_PATH` (optional) — path to the MaxMind GeoLite2-City
 *    `.mmdb` file. When omitted, the geolocator degrades to
 *    null-lookups (design §9).
 *
 * Migrations are run in the Docker entrypoint (design §11) — the
 * production runtime assumes the schema is already up. Local
 * development can call `runMigrations` directly:
 *   `node -e "import('./dist/db/migrator.js').then(m => m.runMigrations({ connectionString: process.env.DATABASE_URL }))"`.
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §11 Docker
 *    entrypoint + §3 container.ts (DI wiring)
 */
import { startServer } from './presentation/server.js';

async function main(): Promise<void> {
  const { close } = await startServer();
  // Graceful shutdown on SIGINT/SIGTERM (Docker stop / Ctrl-C).
  const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
    console.info(`[shortpulse] received ${signal}, shutting down...`);
    await close();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

main().catch((err: unknown) => {
  console.error('[shortpulse] fatal boot error:', err);
  process.exit(1);
});
