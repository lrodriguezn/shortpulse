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

## Quick path

```sh
# 1. Clone, install, configure
git clone https://github.com/lrodriguezn/shortpulse.git shortpulse && cd shortpulse
pnpm install
cp .env.example .env

# 2. Bring up Postgres + run migrations
docker compose -f docker/docker-compose.yml up -d postgres
pnpm --filter @shortpulse/backend db:migrate

# 3. Boot the dev server (FE on :5173, API on :3000)
pnpm dev
```

Open <http://localhost:5173> for the SPA, <http://localhost:3000/health> for
the API health check.

For a production-style run, skip straight to
[Docker execution](#docker-execution).

---

## Features

| Area            | What you get                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Links**       | Create short links with optional custom slug, list with search/sort/pagination, copy-to-clipboard, open, soft-delete with confirm. |
| **Redirects**   | `GET /:slug` → 302 to the original URL, analytics row written synchronously, no auth, no rate-limit (yet).                         |
| **Analytics**   | 4 KPI cards (Total Links, Total Clicks, Clicks Today, Last 7 Days), event table with filters, day/week/month timeseries chart.     |
| **Retention**   | Soft-deleted links stay in the analytics table labelled `(deleted link)` so historical totals never break.                         |
| **Geolocation** | MaxMind GeoLite2-City lookup when the `.mmdb` file is mounted, graceful degrade to `null` when absent.                             |
| **User-agent**  | `ua-parser-js` extracts the browser family on every click.                                                                         |

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

## Local installation

### Prerequisites

- **Node.js 20+** and **pnpm 9+** (run `corepack enable` if you don't have pnpm)
- **PostgreSQL 16** (a `docker compose` recipe is included — see step 2)
- **Git**

### Steps

```sh
# 1. Clone + install deps (pnpm workspaces auto-install across packages)
git clone https://github.com/lrodriguezn/shortpulse.git shortpulse && cd shortpulse
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, PORT, and BASE_URL.
# Defaults work for a local Postgres on localhost:5432 with user/pass shortpulse/shortpulse.

# 3. Start Postgres
docker compose -f docker/docker-compose.yml up -d postgres
# OR run your own local Postgres and point DATABASE_URL at it.

# 4. Run database migrations (idempotent)
pnpm --filter @shortpulse/backend db:migrate

# 5. (Optional) Mount a GeoLite2-City.mmdb — see "Environment variables" below.
#    Without it, country/city analytics columns will be NULL.

# 6. Start the dev servers (FE on :5173, API on :3000, hot-reload)
pnpm dev

# 7. Production build (optional, for the docker image)
pnpm build
```

Open <http://localhost:5173> for the admin UI.

> **Note:** Vite dev server proxies `/api`, `/health`, and short-link redirects
> to the Fastify backend on port 3000, so the SPA at `:5173` and the API at
> `:3000/health` are both reachable from the same origin in dev.

---

## Docker execution

The image is a multi-stage build (Node 20-slim) that bundles the Fastify
backend **and** the built React SPA, served from a single port.

### One command

```sh
docker compose -f docker/docker-compose.yml up -d
```

This brings up two services:

- `shortpulse-app` — the API + SPA, port `${PORT:-3000}` → `3000`
- `shortpulse-postgres` — PostgreSQL 16 with a named `pgdata` volume

A healthcheck on the app container pings `GET /health` every 30s (using
Node 20's built-in `fetch` — no `wget`/`curl` needed in the slim image).
Docker restarts the container on crash unless you explicitly stop it.

### Verify

```sh
# Health
curl http://localhost:3000/health
# → {"status":"ok","db":"connected"}

# Logs
docker compose -f docker/docker-compose.yml logs -f app
```

### Volumes

| Volume   | Mounted at                      | Purpose                                |
| -------- | ------------------------------- | -------------------------------------- |
| `pgdata` | `/var/lib/postgresql/data`      | Postgres data directory (persists).    |
| _bind_   | `/app/geoip/GeoLite2-City.mmdb` | Optional — MaxMind DB for geolocation. |

### Tear down

```sh
docker compose -f docker/docker-compose.yml down            # keep data
docker compose -f docker/docker-compose.yml down -v         # wipe data
```

---

## Dokploy deployment

Dokploy's "One-Click Service" model fits ShortPulse's single-container shape
perfectly — no reverse proxy, no separate API container, no CORS.

### Steps

1. **Create a new Service** in Dokploy → **Docker Compose** (not Docker Image —
   we need the `postgres` sidecar).
2. **Source**: point at this repo (or push the image to a registry and use
   **Docker Image** mode).
3. **Dockerfile path**: `docker/Dockerfile`, **Compose path**:
   `docker/docker-compose.yml`.
4. **Environment variables** (set in the Dokploy UI):

   | Variable        | Example value                                                 | Required |
   | --------------- | ------------------------------------------------------------- | -------- |
   | `DATABASE_URL`  | `postgresql://shortpulse:shortpulse@postgres:5432/shortpulse` | yes      |
   | `PORT`          | `3000`                                                        | yes      |
   | `BASE_URL`      | `https://shortpulse.example.com`                              | yes      |
   | `GEOIP_DB_PATH` | `/app/geoip/GeoLite2-City.mmdb`                               | no       |

   The included `docker-compose.yml` rewrites `DATABASE_URL` to point at the
   in-network `postgres` service, so Dokploy only needs the app's env vars.

5. **Volumes / Mounts**: add a **persistent volume** mounted at
   `/var/lib/postgresql/data` on the `postgres` service. Optionally mount
   your `GeoLite2-City.mmdb` at `/app/geoip/GeoLite2-City.mmdb` on the `app`
   service.
6. **Healthcheck**: Dokploy reads the `healthcheck` block from
   `docker-compose.yml` automatically. The endpoint is `GET /health` — make
   sure Dokploy's domain points to the `app` service.
7. **Domain + TLS**: attach your domain in Dokploy. Dokploy terminates TLS at
   the edge; the app speaks plain HTTP.
8. **Deploy**. The entrypoint runs Drizzle migrations on every boot, so the
   first deploy also provisions the schema.

### Auto-restart

`restart: unless-stopped` is set on both services. Dokploy will not restart
after a manual stop, but will restart on crash or host reboot.

### Rolling back

Dokploy keeps the previous image tag. Hit **Rollback** in the UI to redeploy
the previous image. Because migrations are forward-only and idempotent, a
rollback to an older tag is safe on the same DB schema.

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

## Test execution

| Command                | What it runs                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm test`            | Vitest unit + integration suite (covers all 3 packages). 619 tests.                             |
| `pnpm test --coverage` | Same suite, with `@vitest/coverage-v8` reporter. **90% threshold enforced** — CI fails on drop. |
| `pnpm e2e:install`     | Downloads the Chromium browser for Playwright (one-time, ~150MB).                               |
| `pnpm e2e`             | Playwright end-to-end tests against the live stack (12 tests across 3 spec files).              |
| `pnpm lint`            | ESLint over the monorepo.                                                                       |
| `pnpm typecheck`       | `tsc -b` across shared + backend + frontend + e2e project references.                           |

### E2E test stack

The Playwright suite lives in `/e2e` and expects a running stack at
`PLAYWRIGHT_BASE_URL` (defaults to `http://localhost:3000`). It skips
gracefully when no stack is reachable, so CI can run unit + integration
without Docker.

```sh
# Run E2E against the docker-compose stack
docker compose -f docker/docker-compose.yml up -d
pnpm e2e:install
pnpm e2e
```

### Coverage

Each package enforces **≥ 90%** line + branch coverage:

- `packages/shared/src/` — Zod schemas, constants
- `packages/backend/src/` — domain, application, infrastructure, presentation
- `packages/frontend/src/` — components, hooks, lib

CI fails the build on a coverage drop.

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

---

## API quick reference

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

---

## Screenshots

> **TODO** — the spec calls for a screenshots section once the application is
> finalised. Add captures of:
>
> 1. The links page (create form + table).
> 2. The analytics page (KPI cards + timeseries chart + events table).
> 3. A successful redirect (browser address bar showing the short URL).
>
> Drop them in `docs/screenshots/` and reference them here. Until then, run
> `pnpm dev` and click around — it's the fastest way to see the app.

---

## Development scripts

| Script                                         | Effect                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                                     | Run all packages' `dev` script in parallel (FE + BE). |
| `pnpm build`                                   | Build shared → backend → frontend.                    |
| `pnpm test`                                    | Vitest across all packages.                           |
| `pnpm e2e`                                     | Playwright against `PLAYWRIGHT_BASE_URL`.             |
| `pnpm lint`                                    | ESLint (root + per-package configs).                  |
| `pnpm format`                                  | Prettier write.                                       |
| `pnpm format:check`                            | Prettier check (CI gate).                             |
| `pnpm typecheck`                               | `tsc -b` over the project graph.                      |
| `pnpm --filter @shortpulse/backend db:migrate` | Apply Drizzle migrations.                             |
| `pnpm --filter @shortpulse/backend db:studio`  | Open Drizzle Studio (DB browser).                     |

---

## Contributing

1. Branch off `main` (or the current chained-PR base).
2. Keep work units small — one commit per logical change, tests in the same
   commit as the behavior.
3. `pnpm lint && pnpm typecheck && pnpm test` must pass before opening a PR.
4. Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
5. The CI pipeline runs the same three checks plus the E2E suite against a
   docker-compose stack.

---

## License

[MIT](LICENSE) — see the [LICENSE](LICENSE) file for the full text.
