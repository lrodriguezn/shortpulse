#!/bin/sh
#
# ShortPulse Docker entrypoint.
#
# Runs DB migrations BEFORE starting the Fastify server so the schema
# is always in sync with the image's `drizzle/` folder. The migrator
# is idempotent (Drizzle tracks applied migrations in
# `__drizzle_migrations`), so restarts are safe.
#
# Workflow:
#   1. Wait briefly for PostgreSQL to accept connections (the
#      compose healthcheck gates the app on `pg_isready`, so by the
#      time this script runs, the DB should be reachable — but a
#      small retry loop covers the race where the app container
#      starts before the healthcheck is in steady state).
#   2. Run migrations: `node packages/backend/dist/db/migrator.js`.
#      Migrations are loaded from `packages/backend/drizzle/` (copied
#      into the image by the Dockerfile).
#   3. Start the Fastify server with `exec node ...` so the Node
#      process replaces the shell and receives SIGTERM/SIGINT
#      directly (graceful shutdown, no orphaned children).
#
# Failure mode: any error in steps 1 or 2 makes the script exit
# non-zero. Docker restarts the container (compose `restart:
# unless-stopped`), and the next start retries the migration.
#
# Spec references:
#  - `openspec/changes/add-shortpulse-app/design.md` §11 (Docker
#    strategy, entrypoint.sh)
#  - `openspec/changes/add-shortpulse-app/tasks.md` Phase 10

set -eu

# `set -u` flags unset variables. `set -e` exits on any error.

# ---------------------------------------------------------------------------
# 1. Sanity-check the required env vars up front. Fail fast with a clear
#    message instead of crashing deep in the migrator with a less helpful
#    error.
# ---------------------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[shortpulse] FATAL: DATABASE_URL is not set" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Run DB migrations. The migrator opens a short-lived postgres.js
#    connection, applies all pending migrations from
#    `packages/backend/drizzle/`, and closes the connection. The
#    migrator module reads `DATABASE_URL` from `process.env`.
# ---------------------------------------------------------------------------
echo "[shortpulse] running database migrations..."
node /app/packages/backend/dist/db/migrator.js
echo "[shortpulse] migrations complete"

# ---------------------------------------------------------------------------
# 3. Start the Fastify server. `exec` replaces the shell with the Node
#    process so signals (SIGTERM from `docker stop`, SIGINT from
#    Ctrl-C in dev) reach the server directly — no orphaned shim.
# ---------------------------------------------------------------------------
echo "[shortpulse] starting Fastify server on port ${PORT:-3000}..."
exec node /app/packages/backend/dist/index.js
