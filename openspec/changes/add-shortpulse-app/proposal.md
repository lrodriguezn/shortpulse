# Proposal: ShortPulse URL Shortener (MVP)

## Intent

ShortPulse is a greenfield, **public (no-auth)** URL shortener: anyone can create short links, anyone can follow the redirect, and the app records per-click analytics (geo, browser, referer) so an operator can view totals and a dashboard. This change builds the entire MVP from scratch — monorepo, API, SPA, DB, Docker — to deliver the spec-defining behaviors: create short URLs, redirect, and store/visualize usage analytics.

## Scope

### In Scope

- **Monorepo scaffold**: pnpm workspaces (`packages/{frontend,backend,shared}`), root tooling.
- **Backend**: Fastify + Drizzle ORM, clean/hexagonal layers (domain → application → infrastructure → presentation), simple DI container.
- **Database**: PostgreSQL 16; schema `links` (with **soft-delete** column) and `analytics`; Drizzle Kit migrations (up + down).
- **API (7 endpoints)**: `POST /api/links`, `GET /api/links`, `DELETE /api/links/:id`, `GET /:slug` (redirect), `GET /api/analytics/summary`, `GET /api/analytics`, `GET /api/analytics/timeseries`, plus `GET /health`. Errors follow RFC 7807.
- **Frontend (3 pages)**: `/` Links (TanStack Table + RHF/Zod form + sonner toasts), `/analytics` (KPI cards + Recharts timeseries + events table), `/*` 404. TanStack Router/Query, native fetch wrapper.
- **Slug rules**: case-insensitive (stored lowercased); 3–20 chars; reserved system routes (`analytics`, `api`, `health`, `admin`, `links`, root) rejected with 409.
- **Collision behavior**: custom slug in use → `409 Conflict` with `"Ese slug ya existe, prueba otro"`. No auto-suggest/fallback. Auto-generated slugs retry up to 3× on unique-violation.
- **Redirect flow**: sync analytics write → 302. Not-found / soft-deleted slug → 404. Only URL abuse prevention (http/https valid).
- **Geolocation**: MaxMind GeoLite2 (local DB, offline), `DummyGeolocator` injectable for tests.
- **UA parsing**: `ua-parser-js`; store raw `user_agent` + parsed `browser`.
- **Docker**: multi-stage single container (Fastify serves built SPA); `docker-compose` with postgres + `pgdata` volume; migrations run in entrypoint.
- **Healthcheck**: `GET /health` → 200 `{status:"ok", db:"connected"}` / 503 on DB failure; Docker HEALTHCHECK.
- **Quality tooling**: ESLint, Prettier, Husky, lint-staged, Conventional Commits. **Strict TDD, ≥90% coverage** (Vitest unit+integration with Fastify inject + testcontainers, Playwright E2E).
- **Repo & docs**: GitHub repo `shortpulse`; README (description, stack, install, Docker, Dokploy, structure, tests, env vars, architecture); MIT license.

### Out of Scope (Non-goals)

- Authentication / user accounts / sessions / multi-tenancy.
- Rate limiting, IP blocklist, Safe Browsing / abuse filtering (accepted risk).
- Link expiration, custom domains, QR codes, tags, bulk import.
- Admin panel UI (management is the public Links page).
- Native mobile apps, SSR/Next, SEO optimization.
- Queue/worker analytics pipeline; multi-container (nginx) topology.

## Capabilities

> Contract for sdd-spec. `openspec/specs/{links,analytics}` already exist (empty); spec phase fills them. `health` is new.

### New Capabilities

- `links`: link lifecycle — create (custom/auto slug), list, soft-delete, redirect, slug rules (case-insensitive, 3–20, reserved routes), 409 collision semantics.
- `analytics`: analytics event recording on redirect (geo + UA + referer), summary KPIs, paginated events query, timeseries aggregation; retention after link soft-delete (deleted link rendering).
- `health`: app + DB healthcheck behavior (200 connected / 503 disconnected).

### Modified Capabilities

- None. Greenfield.

## Approach

Hexagonal backend: pure domain (`Link`, `AnalyticsEvent`, `SlugGenerator`, `SlugValidator`, `UrlValidator`, repository interfaces), application use-cases (`CreateLink`, `Redirect`, `Analytics`, `DeleteLink`, `ListLinks`), infra adapters (`DrizzleLink/AnalyticsRepository`, `MaxMindGeolocator`, `UaParserJsAdapter`), thin Fastify presentation. Shared Zod schemas in `@shortpulse/shared` consumed by both FE forms and BE validation (no drift). Redirect = sync analytics write then 302 (simplicity + guaranteed capture at VPS scale). Single Docker container serves SPA + API for Dokploy. TDD mandatory (`red-green-refactor` per work unit; commit by work unit, not by file type).

## Affected Areas

| Area                                      | Impact | Description                                                  |
| ----------------------------------------- | ------ | ------------------------------------------------------------ |
| `packages/backend`                        | New    | Fastify, hexagonal layers, Drizzle, migrations, container.ts |
| `packages/frontend`                       | New    | Vite SPA, TanStack Router/Query/Table, RHF, Recharts, sonner |
| `packages/shared`                         | New    | Zod schemas, types, slug/URL constants                       |
| `docker/`                                 | New    | Multi-stage Dockerfile, docker-compose.yml                   |
| `openspec/specs/{links,analytics,health}` | New    | Capability specs (filled by sdd-spec)                        |
| `README.md`, `LICENSE`                    | New    | Docs + MIT                                                   |

## Risks

| Risk                                                             | Likelihood | Mitigation                                                                       |
| ---------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| No-auth abuse / spam link creation                               | Med        | Accepted product decision; URL-only validation; revisit rate-limit later         |
| MaxMind GeoLite2 DB staleness                                    | Med        | Rebuild image regularly / cron refresh; local DB keeps redirects offline-safe    |
| Sync analytics write latency under DB load                       | Low–Med    | Acceptable at VPS scale; documented exit to async queue if growth demands        |
| Soft-delete query complexity (deleted-link rendering in reports) | Med        | Analytics FK retained; queries coalesce name to `"(deleted link)"` via LEFT JOIN |
| Single-container scaling ceiling                                 | Low        | Split to nginx+API later if needed; correct for VPS/Dokploy                      |
| Slug collision race (concurrent creates)                         | Low        | DB UNIQUE constraint + retry (auto) / 409 (custom)                               |

## Rollback Plan

Greenfield: rollback = revert the PR / delete the feature branch. DB migrations are reversible (`drizzle-kit generate` produces down migrations); a rollback migration restores `links`/`analytics` to prior state. If already deployed to VPS, re-deploy previous image tag (Dokploy) then run down migration.

## Dependencies

- PostgreSQL 16+, Node 20+, pnpm.
- MaxMind GeoLite2 City DB (downloaded into image).
- External libs: Fastify, Drizzle ORM/Kit, TanStack Router/Query/Table, Recharts, sonner, ua-parser-js, Vitest, Playwright, testcontainers.

## Success Criteria

- [ ] Operator can create a link (custom or auto slug) from `/` and see it in the list.
- [ ] Following `/:slug` returns 302 to original URL and records one analytics event.
- [ ] Duplicate custom slug → 409 with `"Ese slug ya existe, prueba otro"`; reserved/case-variant slugs rejected.
- [ ] DELETE marks link soft-deleted; subsequent redirect → 404; analytics history retained & rendered with `(deleted link)`.
- [ ] `/analytics` shows KPIs, timeseries chart, paginated events.
- [ ] `pnpm build`, `pnpm test`, `docker compose up` all succeed; coverage ≥ 90%.
- [ ] `GET /health` reports DB status; Docker HEALTHCHECK green.

## Open Questions for Spec Phase

1. **Analytics table columns**: exact set + types (timestamps timestamptz? ip as inet or text? nullable geo?).
2. **Timeseries granularity semantics**: default bucket for `day|week|month`; timezone handling (UTC vs app-local); inclusive/exclusive `date_to`.
3. **KPI definitions**: `clicks_today` / `clicks_7d` timezone basis; whether soft-deleted clicks count toward totals.
4. **Reserved-route list**: confirm final set + whether aliasing (`Api` → `api`) is purely case-fold.
5. **Soft-delete rendering token**: literal string `"(deleted link)"` vs structured flag `{deleted: true}` in API responses / analytics rows.
6. **Pagination bounds**: max `pageSize`, default sort key for events.
7. **BASE_URL**: how `short_url` is composed; trailing-slash / casing normalization.
