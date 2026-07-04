# syntax=docker/dockerfile:1.7
#
# ShortPulse — multi-stage production Dockerfile.
#
# Stages:
#   deps       — fetch the offline pnpm store from the lockfile.
#                Pure cache layer: rebuilds only when the lockfile or
#                any package.json changes.
#   build      — install ALL deps (dev + prod), then compile
#                shared → backend → frontend. The frontend `dist/`
#                is what the backend will serve at runtime.
#   prod-deps  — install only the production dependency tree
#                (drops devDependencies like vitest, testcontainers,
#                drizzle-kit). Smaller `node_modules` → smaller image.
#   runtime    — `node:22-slim` final image. Carries the compiled
#                `dist/` folders, the production `node_modules`,
#                the Drizzle migrations, and the entrypoint script.
#                ~150 MB on disk.
#
# Healthcheck: `node:22-slim` ships neither `wget` nor `curl`, so the
# HEALTHCHECK uses Node's global `fetch` directly — no
# `apt-get install`, no extra layers. See design §11 (Docker) +
# fix #4 from the design gate review.
#
# Build context: the repository root (docker-compose uses
# `context: ., dockerfile: docker/Dockerfile`).
#
# Spec references:
#  - `openspec/changes/add-shortpulse-app/design.md` §11 (Docker
#    strategy) + ADR-003 (single container serves SPA + API)
#  - `openspec/changes/add-shortpulse-app/tasks.md` Phase 10

ARG PNPM_VERSION=11.9.0

# =============================================================================
# Stage 1: deps — populate the offline pnpm store from the lockfile
# =============================================================================
FROM node:22-slim AS deps

WORKDIR /app

# Enable corepack and pin pnpm to a known version so the build is
# reproducible across machines and CI.
RUN corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy ONLY the files pnpm needs to resolve the workspace + populate
# the offline store. No source yet — keeps this layer small and
# cache-friendly.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json  ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# `pnpm fetch` downloads every tarball referenced by the lockfile
# into pnpm's content-addressable store. The actual install is
# deferred to the `build` stage so this layer only invalidates on
# lockfile / package.json changes.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch

# =============================================================================
# Stage 2: build — install all deps, compile shared + backend + frontend
# =============================================================================
FROM deps AS build

WORKDIR /app

# Copy the full source now that the offline store is populated.
# pnpm will resolve workspace links (@shortpulse/shared from the
# backend, @shortpulse/shared from the frontend) from the local
# packages — no registry round-trip.
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared/  ./packages/shared/
COPY packages/backend/ ./packages/backend/
COPY packages/frontend/ ./packages/frontend/

# `--offline` reuses the store from `pnpm fetch`; `--frozen-lockfile`
# fails the build if the lockfile is out of date (CI safety net).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile

# Build order: shared first (consumed by both backend and frontend),
# then backend and frontend in parallel-friendly order.
RUN pnpm --filter @shortpulse/shared   build \
    && pnpm --filter @shortpulse/backend build \
    && pnpm --filter @shortpulse/frontend build

# =============================================================================
# Stage 3: prod-deps — install only the production dependency tree
# =============================================================================
FROM deps AS prod-deps

WORKDIR /app

# Reuse the source copy from `build` for workspace resolution
# (pnpm needs the local package dirs to create the symlinks).
COPY --from=build /app/packages/shared/  ./packages/shared/
COPY --from=build /app/packages/backend/ ./packages/backend/

# `--prod` drops devDependencies (vitest, @testcontainers/*,
# drizzle-kit, eslint, etc.). The result is a slimmed `node_modules`
# that the runtime image copies in.
# `CI=true` prevents pnpm from aborting on non-TTY prompts.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    CI=true pnpm install --offline --frozen-lockfile --prod

# =============================================================================
# Stage 4: runtime — the final production image
# =============================================================================
FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
# Default port; compose / Dokploy override via the `PORT` env var.
ENV PORT=3000
# Tells the static plugin where the built SPA lives. The build stage
# copies the frontend `dist/` to exactly this path.
ENV FRONTEND_DIST_PATH=/app/packages/frontend/dist

# Healthcheck: Node's global `fetch` (no `wget` / `curl` needed).
# Probes `/health` — returns 200 when DB is reachable, 503 otherwise
# (see health-route.ts). The `--start-period=10s` gives the app time
# to boot and run migrations on first start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Copy the production node_modules (backend + shared + root).
# These are already symlinked by pnpm — `@shortpulse/shared` in the
# backend's `node_modules/` points at `packages/shared/`.
COPY --from=prod-deps /app/node_modules                   ./node_modules
COPY --from=prod-deps /app/packages/shared/node_modules  ./packages/shared/node_modules
COPY --from=prod-deps /app/packages/backend/node_modules ./packages/backend/node_modules

# Copy package.json files (needed for module resolution and
# `pnpm db:migrate` / `node dist/index.js` to locate the package root).
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json  ./packages/shared/
COPY --from=build /app/packages/backend/package.json ./packages/backend/

# Copy the compiled output: shared types, backend JS, frontend SPA.
COPY --from=build /app/packages/shared/dist  ./packages/shared/dist
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist

# Copy the Drizzle migration SQL files (the migrator reads them at
# runtime from `<backend>/drizzle/`). They're generated by
# `pnpm db:generate` and committed to the repo.
COPY --from=build /app/packages/backend/drizzle ./packages/backend/drizzle

# Copy the entrypoint script. The script is the container's ENTRYPOINT;
# it runs DB migrations before starting the Fastify server (so the
# schema is always in sync with the image's `drizzle/` folder).
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Document the port (compose / Dokploy still need to publish it).
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
