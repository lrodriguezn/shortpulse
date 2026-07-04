# ShortPulse

> URL shortener with click analytics. One container, one database, no auth.

ShortPulse is a self-hosted URL shortener with built-in click analytics. Create
short links, share them, and watch the clicks roll in — broken down by country,
browser, and time. It runs as a single Docker container that serves both the
React admin SPA and the JSON API over the same port.

- **Hexagonal backend** (Fastify + Drizzle + PostgreSQL 16) keeps the domain
  pure and the adapters swappable.
- **TanStack-powered SPA** (Router + Query + Table) gives instant search,
  sortable tables, and live KPI cards.
- **One container** (Multi-stage Dockerfile + Compose) deploys to any VPS
  with one command — Dokploy-friendly.

---

## Table of contents

- [Quick path](#quick-path) — 3 commands to a running app
- [Prerequisites](#prerequisites) — what you need + how to verify
- [Execution paths](#execution-paths) — local dev · Docker · production
  - [Path A: Local development](#path-a-local-development)
  - [Path B: Docker](#path-b-docker)
  - [Path C: Production / Dokploy](#path-c-production--dokploy)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Development scripts](#development-scripts)
- [Troubleshooting](#troubleshooting)
- [Production checklist](#production-checklist)
- [Contributing](#contributing)
- [License](#license)

---

## Quick path

```sh
git clone https://github.com/lrodriguezn/shortpulse.git shortpulse && cd shortpulse
pnpm install && cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
```

Open <http://localhost:3000> — the SPA, API, and redirects all live on one port.

```sh
curl http://localhost:3000/health
# → {"status":"ok","db":"connected"}
```

For a guided setup with verification at each step, pick an
[execution path](#execution-paths) below.

---

## Prerequisites

### Required

| Tool               | Version                           | Verify                                                             |
| ------------------ | --------------------------------- | ------------------------------------------------------------------ |
| **Node.js**        | 20+                               | `node --version` → `v20.x` or higher                               |
| **pnpm**           | 9+                                | `pnpm --version` → `9.x` or higher (enable with `corepack enable`) |
| **Git**            | any                               | `git --version`                                                    |
| **Docker**         | 23+ (for Docker/Prod paths)       | `docker --version`                                                 |
| **Docker Compose** | v2+                               | `docker compose version`                                           |
| **PostgreSQL 16**  | local OR via the included compose | only needed for Path A without Docker                              |

### One-time setup

```sh
# Enable pnpm if you don't have it
corepack enable
corepack prepare pnpm@latest --activate

# Verify
node --version && pnpm --version && git --version
```

---

## Execution paths

Three paths, same app. Pick the one that matches your goal.

| Path                        | Use when                             | Time    | Needs Docker        |
| --------------------------- | ------------------------------------ | ------- | ------------------- |
| **A. Local development**    | Hacking on the code, hot-reload      | ~5 min  | Only for Postgres   |
| **B. Docker**               | Testing the production image locally | ~3 min  | Yes                 |
| **C. Production / Dokploy** | Deploying to a VPS                   | ~10 min | Yes (on the server) |

---

### Path A: Local development

Hot-reload frontend on `:5173`, API on `:3000`, Vite proxies API calls.

#### Step 1 — Clone and install

```sh
git clone https://github.com/lrodriguezn/shortpulse.git shortpulse
cd shortpulse
pnpm install
```

**Verify:** `pnpm -r list` shows `@shortpulse/shared`, `@shortpulse/backend`,
`@shortpulse/frontend`.

#### Step 2 — Configure environment

```sh
cp .env.example .env
```

Edit `.env` — at minimum set these three:

| Variable       | Example                                                        | Why                        |
| -------------- | -------------------------------------------------------------- | -------------------------- |
| `DATABASE_URL` | `postgresql://shortpulse:shortpulse@localhost:5432/shortpulse` | Postgres connection        |
| `PORT`         | `3000`                                                         | API port                   |
| `BASE_URL`     | `http://localhost:3000`                                        | Used to render `short_url` |

> The defaults in `.env.example` match the included `docker-compose.yml`
> Postgres service, so if you use step 3 below you don't need to edit anything.

#### Step 3 — Start Postgres

```sh
docker compose -f docker/docker-compose.yml up -d postgres
```

**Verify:** `docker compose -f docker/docker-compose.yml ps postgres` shows
`healthy`. Or, if running your own Postgres, `psql "$DATABASE_URL" -c "SELECT 1"`.

#### Step 4 — Run database migrations

```sh
pnpm --filter @shortpulse/backend db:migrate
```

**Verify:** the command prints the applied migration (`0000_init` or similar)
with no errors. The `links` and `analytics` tables now exist.

#### Step 5 — (Optional) Mount GeoLite2 for geolocation

Without a MaxMind GeoLite2-City `.mmdb` file, the `country` and `city`
analytics columns will be `null`. The app is fully functional without it.

```sh
# If you have a license key from MaxMind (free):
# Download GeoLite2-City.mmdb and set:
echo "GEOIP_DB_PATH=/absolute/path/to/GeoLite2-City.mmdb" >> .env
```

#### Step 6 — Start the dev servers

```sh
pnpm dev
```

**Verify:**

- SPA: <http://localhost:5173> loads the Links page.
- API: <http://localhost:3000/health> → `{"status":"ok","db":"connected"}`.
- Create a link in the UI, then visit its short URL — you should redirect.

> Vite dev server proxies `/api`, `/health`, and short-link redirects to the
> Fastify backend on port 3000, so `:5173` and `:3000` share an origin in dev.

#### Step 7 — (Optional) Production build

```sh
pnpm build
```

**Verify:** `packages/frontend/dist/` and `packages/backend/dist/` exist.

---

### Path B: Docker

The production image — multi-stage Node 20-slim, bundles backend + built SPA.

#### Step 1 — Configure

```sh
cp .env.example .env
# Edit .env: set BASE_URL to your domain (e.g. http://localhost:3000 for local)
```

#### Step 2 — Build and start

```sh
docker compose -f docker/docker-compose.yml up -d --build
```

This brings up two services:

| Service               | Image                          | Port                 | Volume               |
| --------------------- | ------------------------------ | -------------------- | -------------------- |
| `shortpulse-app`      | built from `docker/Dockerfile` | `${PORT:-3000}:3000` | —                    |
| `shortpulse-postgres` | `postgres:16-alpine`           | —                    | `pgdata` (persisted) |

The entrypoint runs Drizzle migrations **before** booting the app, so the
schema is always current on start.

#### Step 3 — Verify

```sh
# Health (the Docker HEALTHCHECK uses this endpoint)
curl http://localhost:3000/health
# → {"status":"ok","db":"connected"}

# Create a link
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"original_url":"https://example.com","slug":"demo"}'
# → {"id":"...","original_url":"https://example.com","slug":"demo","short_url":"http://localhost:3000/demo",...}

# Follow the short URL (302 redirect)
curl -I http://localhost:3000/demo
# → HTTP/1.1 302
# → Location: https://example.com

# Logs
docker compose -f docker/docker-compose.yml logs -f app
```

#### Step 4 — Tear down

```sh
docker compose -f docker/docker-compose.yml down        # keep data
docker compose -f docker/docker-compose.yml down -v     # wipe data
```

---

### Path C: Production / Dokploy

ShortPulse is shaped for Dokploy's Docker Compose service model — one
container serves SPA + API + redirects, no reverse proxy or CORS needed.

#### Step 1 — Prepare the server

| Requirement                         | Why                            |
| ----------------------------------- | ------------------------------ |
| Dokploy installed on a VPS          | Orchestrates the compose stack |
| A domain pointing at the VPS        | For TLS + short URLs           |
| (Optional) MaxMind GeoLite2 `.mmdb` | For country/city analytics     |

#### Step 2 — Create the service in Dokploy

1. In Dokploy, create a new **Docker Compose** service (not Docker Image —
   we need the `postgres` sidecar).
2. **Source**: point at `https://github.com/lrodriguezn/shortpulse` (or push
   the built image to a registry and use Docker Image mode).
3. **Paths**: Dockerfile = `docker/Dockerfile`,
   Compose = `docker/docker-compose.yml`.

#### Step 3 — Set environment variables

In the Dokploy UI, set:

| Variable        | Example                                                       | Required |
| --------------- | ------------------------------------------------------------- | -------- |
| `DATABASE_URL`  | `postgresql://shortpulse:shortpulse@postgres:5432/shortpulse` | yes      |
| `PORT`          | `3000`                                                        | yes      |
| `BASE_URL`      | `https://shortpulse.yourdomain.com`                           | yes      |
| `GEOIP_DB_PATH` | `/app/geoip/GeoLite2-City.mmdb`                               | no       |

> The included `docker-compose.yml` rewrites `DATABASE_URL` to point at the
> in-network `postgres` service, so Dokploy only needs the app's env vars.

#### Step 4 — Volumes and mounts

| Mount                                           | Service    | Purpose              |
| ----------------------------------------------- | ---------- | -------------------- |
| Persistent volume at `/var/lib/postgresql/data` | `postgres` | Survives redeploy    |
| Bind `GeoLite2-City.mmdb` at `/app/geoip/`      | `app`      | Optional geolocation |

#### Step 5 — Domain and TLS

Attach your domain in Dokploy. Dokploy terminates TLS at the edge; the app
speaks plain HTTP behind it. Make sure the domain routes to the `app` service.

#### Step 6 — Deploy

Hit **Deploy**. The entrypoint runs migrations on every boot, so the first
deploy also provisions the schema.

#### Step 7 — Post-deploy verification

```sh
# From your local machine, against the deployed domain:
curl https://shortpulse.yourdomain.com/health
# → {"status":"ok","db":"connected"}

# Create a link
curl -X POST https://shortpulse.yourdomain.com/api/links \
  -H "Content-Type: application/json" \
  -d '{"original_url":"https://example.com","slug":"hello"}'

# Follow it
curl -I https://shortpulse.yourdomain.com/hello
# → 302 → Location: https://example.com
```

#### Auto-restart

`restart: unless-stopped` is set on both services. Dokploy restarts on crash
or host reboot, but not after a manual stop.

#### Rolling back

Dokploy keeps the previous image tag. Hit **Rollback** in the UI. Migrations
are forward-only and idempotent, so rollback to an older tag is safe on the
same DB schema.

---

## Features

| Area            | What you get                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Links**       | Create short links with optional custom slug, list with search/sort/pagination, copy-to-clipboard, open, soft-delete with confirm. |
| **Redirects**   | `GET /:slug` → 302 to the original URL, analytics row written synchronously, no auth, no rate-limit.                               |
| **Analytics**   | 4 KPI cards (Total Links, Total Clicks, Clicks Today, Last 7 Days), event table with filters, day/week/month timeseries chart.     |
| **Retention**   | Soft-deleted links stay in the analytics table labelled `(deleted link)` so historical totals never break.                         |
| **Geolocation** | MaxMind GeoLite2-City lookup when the `.mmdb` file is mounted, graceful degrade to `null` when absent.                             |
| **User-agent**  | `ua-parser-js` extracts the browser family on every click.                                                                         |

### Product decisions

| Decision         | Choice                                        | Rationale                                                         |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Authentication   | Public, no auth                               | Simplest MVP; anyone can create links                             |
| Slug collision   | HTTP 409, "Ese slug ya existe, prueba otro"   | Clear error, no silent fallback                                   |
| Deletion         | Soft-delete, analytics retained               | Historical reports stay accurate                                  |
| Abuse prevention | URL validation only (http/https)              | Trust-first; add rate-limiting later if needed                    |
| Slug rules       | Case-insensitive, 3–20 chars, reserved routes | Avoids collisions with app routes (`/analytics`, `/health`, etc.) |

---

## Tech stack

| Layer        | Choice                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **Frontend** | React 18 · TanStack Router / Query / Table · React Hook Form · Zod · Recharts · TailwindCSS · Vite |
| **Backend**  | Fastify 5 · TypeScript · Drizzle ORM · PostgreSQL 16 · MaxMind GeoLite2 · ua-parser-js             |
| **Shared**   | Zod schemas imported by both FE and BE — zero contract drift                                       |
| **Tests**    | Vitest (unit + integration with testcontainers) · Playwright (E2E)                                 |
| **Ops**      | pnpm workspaces · Docker multi-stage · Docker Compose · Husky + commitlint · GitHub Actions CI     |

---

## Project structure

```
shortpulse/
├── packages/
│   ├── shared/        # @shortpulse/shared — Zod schemas, constants, types
│   │   └── src/
│   │       ├── schemas/     # link, analytics, health, problem
│   │       └── constants/   # reserved-routes, slug alphabet + regex
│   ├── backend/       # @shortpulse/backend — Fastify + Drizzle
│   │   └── src/
│   │       ├── domain/         # Link, AnalyticsEvent, Slug, errors (pure TS)
│   │       ├── application/    # 7 use-cases + ports (geolocator, ua-parser)
│   │       ├── infrastructure/ # Drizzle repos, MaxMind, ua-parser adapters
│   │       ├── presentation/   # Fastify plugins, error-mapper, static
│   │       └── container.ts    # DI wiring at boot
│   └── frontend/      # @shortpulse/frontend — Vite SPA
│       └── src/
│           ├── routes/         # TanStack Router file-based
│           ├── features/links/     # create form, table, hooks
│           ├── features/analytics/ # KPIs, events table, timeseries chart
│           ├── components/ui/  # button, input, table, empty-state, ...
│           └── lib/            # api-client, query-keys
├── docker/            # Multi-stage Dockerfile, compose, entrypoint
├── e2e/               # Playwright critical-journey tests
├── openspec/          # SDD artifacts (proposal, spec, design, tasks)
├── tests/             # Root config-sanity tests
├── playwright.config.ts
├── vitest.config.ts
└── package.json
```

The hexagonal backend (`domain` ← `application` ← `infrastructure` + `presentation`)
keeps the business logic in pure TypeScript with zero external dependencies.
The application layer defines ports (`Geolocator`, `UaParser`,
`LinkRepository`, `AnalyticsRepository`); the infrastructure layer provides
adapters (Drizzle, MaxMind, ua-parser-js). `container.ts` wires them at boot.

---

## Architecture

### Hexagonal backend

```
       ┌────────────── Browser (React SPA) ──────────────┐
       │                                                ▼
       │                                       ┌─────────────────┐
       │                                       │   Fastify 5     │
       │                                       │  (single proc)  │
       │                                       └─────┬───────────┘
       │                                             │
       │  ┌──────────────────────┐  ┌────────────┐  ┌▼─────────────┐  ┌────────────┐
       │  │   Presentation       │  │ Application│  │Infrastructure│  │   Domain   │
       │  │  (Fastify plugins)   │──▶ (use-cases)│◀─│  (Drizzle,   │◀─│  (pure TS) │
       │  │  error-mapper,       │  │  + ports   │  │  MaxMind,    │  │  Link, VO  │
       │  │  static plugin       │  │            │  │  ua-parser)  │  │            │
       │  └──────────────────────┘  └────────────┘  └──────────────┘  └────────────┘
       │                                                                     │
       └─────────────────────────────────────────────────────────────────────┘
                                                               │
                                             ┌─────────────────┴──────────────┐
                                             ▼                                ▼
                                     ┌──────────────┐              ┌────────────────────┐
                                     │ PostgreSQL 16│              │ GeoLite2-City.mmdb │
                                     └──────────────┘              └────────────────────┘
```

Dependency direction points **inward**: `infrastructure` and `presentation`
both depend on `application` interfaces; `domain` depends on nothing but
TypeScript. `container.ts` is the only place that knows about every concrete
implementation.

### Single container

The Fastify process also serves the built React SPA via `@fastify/static`,
so one port (default `3000`) handles `GET /` (SPA), `GET /api/*` (JSON),
`GET /:slug` (redirects), and `GET /health` (probes). No CORS, no nginx
sidecar, Dokploy-friendly.

### Shared contract

Both the frontend and the backend import `@shortpulse/shared` — Zod schemas
for `createLinkSchema`, `linkResponseSchema`, the analytics events, the
query schemas, and the RFC 7807 `problemDetailsSchema`. The form uses
`zodResolver(createLinkSchema)` from React Hook Form, so the browser-side
validation matches the server-side validation byte-for-byte.

### Key architecture decisions (ADRs)

| ADR | Decision                                       | Rationale                                                       |
| --- | ---------------------------------------------- | --------------------------------------------------------------- |
| 001 | Fastify + Drizzle over Express/NestJS + Prisma | TS-first, lightweight, repository-friendly, TDD-ergonomic       |
| 002 | Sync analytics write on redirect               | Simplicity + guaranteed capture; async queue is documented exit |
| 003 | Single container serves SPA + API              | Dokploy simplicity; split later if scale demands                |
| 004 | Soft-delete links with analytics retention     | Report integrity > storage savings                              |
| 005 | MaxMind GeoLite2 local DB over HTTP APIs       | Offline, testable, free, no rate limits                         |
| 006 | Slug regex rejects leading/trailing hyphens    | Cleaner address-bar rendering                                   |

---

## API reference

| Method   | Path                        | What it does                                                                           |
| -------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `POST`   | `/api/links`                | Create a short link. Body: `{original_url, slug?}`.                                    |
| `GET`    | `/api/links`                | List links. Query: `search`, `sortBy`, `sortDir`, `page`, `page_size`.                 |
| `DELETE` | `/api/links/:id`            | Soft-delete a link. Idempotent.                                                        |
| `GET`    | `/:slug`                    | 302 redirect to the original URL (sync analytics).                                     |
| `GET`    | `/api/analytics/summary`    | KPI cards: total_links, total_clicks, clicks_today, clicks_last_7_days.                |
| `GET`    | `/api/analytics`            | Event table. Query: `link_id`, `date_from`, `date_to`, `country`, `page`, `page_size`. |
| `GET`    | `/api/analytics/timeseries` | Timeseries buckets. Query: `granularity` (day/week/month), `date_from`, `date_to`.     |
| `GET`    | `/health`                   | Liveness probe. 200 if `SELECT 1` succeeds, 503 otherwise.                             |

All errors are RFC 7807 `application/problem+json`. The custom-slug collision
error returns `409` with `detail: "Ese slug ya existe, prueba otro"`.

### Examples

```sh
# Create a link with a custom slug
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"original_url":"https://github.com","slug":"gh"}'
# 201 → {"id":"...","original_url":"https://github.com","slug":"gh","short_url":"http://localhost:3000/gh","created_at":"...","click_count":0,"deleted_at":null}

# Collision (409)
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"original_url":"https://example.com","slug":"gh"}'
# 409 → {"type":"about:blank","title":"Slug collision","status":409,"detail":"Ese slug ya existe, prueba otro"}

# Invalid URL (400)
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"original_url":"ftp://bad.example"}'
# 400 → {"type":"about:blank","title":"Invalid URL","status":400,"detail":"..."}

# List links with pagination + search
curl "http://localhost:3000/api/links?search=github&page=1&page_size=10"

# Analytics summary
curl http://localhost:3000/api/analytics/summary

# Timeseries (last 30 days, daily buckets)
curl "http://localhost:3000/api/analytics/timeseries?granularity=day"
```

---

## Testing

### Commands

| Command              | What it runs                                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| `pnpm test`          | Vitest unit + integration suite (664 tests across 3 packages).                  |
| `pnpm test:coverage` | Same suite + `@vitest/coverage-v8`. **90% threshold enforced** — fails on drop. |
| `pnpm e2e:install`   | Downloads Chromium for Playwright (one-time, ~150MB).                           |
| `pnpm e2e`           | Playwright E2E against the live stack (12 tests across 3 spec files).           |
| `pnpm lint`          | ESLint over the monorepo.                                                       |
| `pnpm typecheck`     | `tsc -b` across shared + backend + frontend + e2e.                              |

### Coverage

| Metric     | Threshold | Current |
| ---------- | --------- | ------- |
| Lines      | 90%       | 96.67%  |
| Branches   | 90%       | 92.06%  |
| Functions  | 90%       | 92.85%  |
| Statements | 90%       | 96.67%  |

CI fails the build on a coverage drop below 90%.

### E2E suite

The Playwright suite lives in `e2e/` and expects a running stack at
`http://localhost:3000` (override with `PLAYWRIGHT_BASE_URL`). It skips
gracefully when no stack is reachable, so CI can run unit + integration
without Docker.

```sh
# Run E2E against the docker-compose stack
docker compose -f docker/docker-compose.yml up -d
pnpm e2e:install
pnpm e2e
```

The 12 E2E tests cover the 4 spec-required journeys:

| Spec file                            | Journey                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `create-link.e2e.spec.ts`            | Create with auto-slug, custom slug, 409 collision, invalid URL     |
| `redirect-and-analytics.e2e.spec.ts` | 302 redirect, KPI increments, 404 missing, 404 deleted + retention |
| `delete-link.e2e.spec.ts`            | Delete via table, 404 after delete, analytics retention            |

### Test layers

| Layer           | Tool                                         | Scope                                                               |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **Unit**        | Vitest                                       | Domain (slug gen/validate), use-cases (mocked repos), UI components |
| **Integration** | Vitest + `light-my-request` + testcontainers | Fastify routes → real Postgres (ephemeral container)                |
| **E2E**         | Playwright                                   | Browser against the full docker-compose stack                       |

---

## Environment variables

All env vars are read by `container.ts` at boot. The backend validates that
`DATABASE_URL` is present; the rest are optional with sensible defaults.

| Variable             | Required | Default                    | Purpose                                                                                                   |
| -------------------- | -------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | yes      | —                          | PostgreSQL connection string. Used by Drizzle migrations + the API.                                       |
| `PORT`               | no       | `3000`                     | Port the Fastify server binds to. Also used by the Docker healthcheck.                                    |
| `BASE_URL`           | no       | `http://localhost:${PORT}` | Public base URL used to render `short_url` in the `createLink` response.                                  |
| `GEOIP_DB_PATH`      | no       | _(unset)_                  | Path to a MaxMind GeoLite2-City `.mmdb` file. Unset → `DummyGeolocator`, country/city columns are `null`. |
| `FRONTEND_DIST_PATH` | no       | `../frontend/dist`         | Path to the built SPA bundle. The static plugin serves it.                                                |
| `NODE_ENV`           | no       | —                          | Standard Node env var; affects logging and Fastify perf defaults.                                         |

See [`.env.example`](.env.example) for a copy-paste-ready template.

---

## Development scripts

| Script                                          | Effect                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                                      | Run all packages' `dev` script in parallel (FE + BE hot-reload). |
| `pnpm build`                                    | Build shared → backend → frontend.                               |
| `pnpm test`                                     | Vitest across all packages.                                      |
| `pnpm test:coverage`                            | Vitest with coverage (90% threshold).                            |
| `pnpm e2e`                                      | Playwright against `PLAYWRIGHT_BASE_URL`.                        |
| `pnpm e2e:install`                              | Install Playwright Chromium browser.                             |
| `pnpm lint`                                     | ESLint (root + per-package configs).                             |
| `pnpm format`                                   | Prettier write.                                                  |
| `pnpm format:check`                             | Prettier check (CI gate).                                        |
| `pnpm typecheck`                                | `tsc -b` over the project graph.                                 |
| `pnpm --filter @shortpulse/backend db:generate` | Generate a new Drizzle migration from schema changes.            |
| `pnpm --filter @shortpulse/backend db:migrate`  | Apply Drizzle migrations.                                        |
| `pnpm --filter @shortpulse/backend db:studio`   | Open Drizzle Studio (DB browser).                                |

---

## Troubleshooting

| Symptom                                   | Likely cause                      | Fix                                                             |
| ----------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:5432`             | Postgres not running              | `docker compose -f docker/docker-compose.yml up -d postgres`    |
| `relation "links" does not exist`         | Migrations not run                | `pnpm --filter @shortpulse/backend db:migrate`                  |
| `409 Slug collision` on first create      | Slug already exists               | Pick a different slug, or omit it for auto-generation           |
| `country`/`city` always `null`            | No GeoLite2 `.mmdb` mounted       | Set `GEOIP_DB_PATH` (optional — app works without it)           |
| Healthcheck shows `db: "disconnected"`    | DB unreachable from app container | Check `DATABASE_URL` + that the `postgres` service is `healthy` |
| `Cannot find module '@shortpulse/shared'` | Shared package not built          | `pnpm --filter @shortpulse/shared build`                        |
| E2E tests all skip                        | No live stack at `:3000`          | `docker compose up -d` then `pnpm e2e`                          |
| `docker compose up` fails on build        | BuildKit not enabled              | `export DOCKER_BUILDKIT=1` (default in Docker 23+)              |
| Port already in use                       | Another process on `:3000`        | Change `PORT` in `.env` or stop the other process               |
| Husky `Deprecated` warning                | Husky v9 → v10 migration pending  | Non-blocking; hooks still work. See `.husky/`                   |

---

## Production checklist

Before going live, confirm each item:

### Code + build

- [ ] `pnpm lint` passes (0 errors)
- [ ] `pnpm typecheck` passes (0 errors)
- [ ] `pnpm test` passes (664+ tests)
- [ ] `pnpm test:coverage` ≥ 90% all metrics
- [ ] `pnpm build` succeeds (all 3 packages)

### Docker

- [ ] `docker compose -f docker/docker-compose.yml up -d --build` starts cleanly
- [ ] `curl http://localhost:3000/health` → `{"status":"ok","db":"connected"}`
- [ ] Create-link → redirect → analytics flow works end-to-end
- [ ] `pgdata` volume persists across `down`/`up` (without `-v`)

### Dokploy / VPS

- [ ] Domain DNS points at the server
- [ ] Dokploy service created with `docker/Dockerfile` + `docker/docker-compose.yml`
- [ ] Env vars set: `DATABASE_URL`, `PORT`, `BASE_URL`, (optional `GEOIP_DB_PATH`)
- [ ] Persistent volume mounted at `/var/lib/postgresql/data`
- [ ] TLS enabled (Dokploy edge termination)
- [ ] `restart: unless-stopped` confirmed in compose
- [ ] Post-deploy `curl https://yourdomain.com/health` returns 200
- [ ] (Optional) `GeoLite2-City.mmdb` mounted at `/app/geoip/`

### Security (accepted risks for MVP)

- [ ] No auth — anyone can create links (accepted product decision)
- [ ] No rate-limiting (accepted; add if abused)
- [ ] URL validation only (http/https); no blocklist/Safe Browsing

---

## Contributing

1. Branch off `main`.
2. Keep work units small — one commit per logical change, tests in the same
   commit as the behavior.
3. `pnpm lint && pnpm typecheck && pnpm test` must pass before opening a PR.
4. Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
5. The CI pipeline runs the same three checks plus the E2E suite against a
   docker-compose stack.

---

## License

[MIT](LICENSE) — see the [LICENSE](LICENSE) file for the full text.
