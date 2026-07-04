# Tasks: ShortPulse URL Shortener (MVP)

> Strict TDD (90% coverage). RED → GREEN → REFACTOR per task. Tests in the same commit as the behavior (per `work-unit-commits`). All 14 phases map to one chained PR each (12 PRs after combining).

## Review Workload Forecast

| Field                   | Value                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| Estimated changed lines | ~4500 (greenfield, 15 phases)                                               |
| 400-line budget risk    | High (most BE/FE slices >400)                                               |
| Chained PRs recommended | Yes (12 PRs: 1 scaffold→2 shared→3 DB→4-7 BE→8-10 FE→11 Docker→12 E2E/docs) |
| Delivery strategy       | auto-forecast                                                               |
| Chain strategy          | pending — recommended: stacked-to-main                                      |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High

## Phase 0: Monorepo scaffold

- [x] 0.1 Init: `pnpm-workspace.yaml`, root `package.json`, `.gitignore`, `.editorconfig`, `.npmrc` (auto-install-peers). [S]
- [x] 0.2 `tsconfig.base.json` strict; per-package `tsconfig.json`. [S]
- [x] 0.3 `.eslintrc.cjs`, `.prettierrc`, `.prettierignore`; root `lint`/`format`. [S]
- [x] 0.4 Husky + lint-staged + commitlint. [S]
- [x] 0.5 CI `.github/workflows/ci.yml` runs install/lint/typecheck/test/build. [M]
- [x] 0.6 Empty `packages/{shared,backend,frontend}/package.json` + `vitest.config.ts` (90% threshold). [S]

## Phase 1: packages/shared

- [x] 1.1 `schemas/link.ts` — `createLinkSchema` (http(s) refine + slug regex `^(?!-)[a-z0-9-]{3,20}(?<!-)$`), `linkResponseSchema`, `listLinksQuerySchema`. [S]
- [x] 1.2 `schemas/{analytics,health,problem}.ts` — `summarySchema`, `eventsQuerySchema`, `timeseriesQuerySchema`, `eventRowSchema`, `timeseriesRowSchema`, `healthResponseSchema`, `problemDetailsSchema` (RFC 7807). [M]
- [x] 1.3 `constants/{reserved-routes,slug}.ts` — `RESERVED_ROUTES`, 54-char `AUTO_SLUG_ALPHABET`, `AUTO_SLUG_LENGTH=7`, `CUSTOM_SLUG_REGEX`. [S]
- [x] 1.4 `index.ts` + `types.ts` re-exports; `pnpm --filter shared test` ≥90%. [S]

## Phase 2: Database + migrations

- [ ] 2.1 `infrastructure/db/schema.ts` — `links` (uuid PK, original_url, slug, created_at, deleted_at; `links_slug_uidx` + `links_created_at_idx`); `analytics` (FK ON DELETE RESTRICT; `analytics_link_id_idx` + `analytics_timestamp_desc_idx`). [M]
- [ ] 2.2 `infrastructure/db/{client,migrator}.ts` + `drizzle.config.ts`; `db:generate` → `drizzle/0000_init.sql`; `db:migrate` idempotent. [S]

## Phase 3: Backend domain (pure)

- [x] 3.1 `domain/slug.ts` — `normalize` + `validate` (regex, length 3-20, no leading/trailing hyphen, reserved case-folded); throws `BadRequestError`/`ConflictError`. [S]
- [x] 3.2 `domain/slug-generator.ts` — `generateSlug()` over `crypto.randomBytes`, length 7, draws from `AUTO_SLUG_ALPHABET`. [S]
- [x] 3.3 `domain/{url-validator,link,analytics-event,errors,repositories}.ts` — `Link`, `AnalyticsEvent`, `UrlValidator`, `NotFoundError`/`ConflictError`/`BadRequestError`/`SlugGenerationError`, `LinkRepository`/`AnalyticsRepository` interfaces. [M]

## Phase 4: Backend application

- [x] 4.1 `application/ports.ts` — `Geolocator.lookup(ip)`, `UaParser.parse(ua)`. [S] *(implemented in slice 4 as `domain/ports/{geolocator,ua-parser}.ts` per the orchestrator's design — see slice-4 apply-progress)*
- [x] 4.2 `application/create-link.use-case.ts` — validate → insert; unique-violation retry auto-gen up to 3×; throws `ConflictError` (custom) or `SlugGenerationError` (auto). [M] *(slice 5a)*
- [x] 4.3 `application/redirect.use-case.ts` — findBySlug (lowercased) → 404; else record analytics via ports then return `original_url`. [M] *(slice 5a)*
- [x] 4.4 `application/{list-links,delete-link,get-analytics-summary,list-analytics,get-timeseries}.use-case.ts` — pagination, soft-delete idempotency, `(deleted link)` rendering, 30-day default timeseries. [M] *(slice 5a: 4 link use-cases; slice 5b: 3 analytics use-cases — all 7 use-cases now done)*

## Phase 5: Backend infrastructure

- [ ] 5.1 `infrastructure/drizzle-link.repository.ts` — implements `LinkRepository`; lowercase slug; `deleted_at IS NULL` on reads; LEFT JOIN for `click_count`. [M]
- [ ] 5.2 `infrastructure/drizzle-analytics.repository.ts` — `record`, `summary` (KPI math), `listEvents` (COALESCE slug→'(deleted link)'), `timeseries` (date_trunc day/week/month UTC). [M]
- [ ] 5.3 `infrastructure/{dummy,maxmind}-geolocator.ts` + `ua-parser-js.adapter.ts`. [S]

## Phase 6: Backend presentation

- [x] 6.1 `presentation/error-mapper.ts` — domain errors → RFC 7807 (400/404/409/500). [S] *(slice 7 WU1 — error-mapper + 9 TDD tests)*
- [x] 6.2 `presentation/plugins/health.plugin.ts` — `GET /health` runs `SELECT 1`; 200/503. [S] *(slice 7 WU5 — health-route + 3 TDD tests)*
- [x] 6.3 `presentation/plugins/{links,redirect,analytics}.plugin.ts` + `static.plugin.ts` (serves `dist/` SPA fallback). Reserved routes registered before redirect catch-all. [M] *(slice 7 WU2/3/4 — links/redirect/analytics routes + 29 TDD tests; static deferred to Phase 11)*
- [x] 6.4 `container.ts` (DI) + `index.ts` (migrate → listen); all 8 endpoints integration-tested. [M] *(slice 6 WU6 — container; slice 7 WU6 — buildApp/startServer/index.ts + 6 TDD tests)*

## Phase 7: Frontend scaffold

- [x] 7.1 Vite + React + TS + TailwindCSS; `main.tsx`; `pnpm dev` boots. [M]
- [x] 7.2 TanStack Router file-based; `__root.tsx` (ErrorBoundary, nav); routes `/` `/analytics` `*`; QueryClient + sonner. [M]
- [x] 7.3 `lib/{api-client,query-keys}.ts`; `components/ui/{button,input,table,spinner,toast,error-boundary}.tsx`; `routes/not-found.tsx`. [M]

## Phase 8: Frontend Links feature

- [x] 8.1 `features/links/api/link-api.ts` + `hooks/{use-links,use-create-link,use-delete-link}.ts`. [M] *(slice 8 WU4 — the hooks landed in `packages/frontend/src/hooks/use-links.ts` + the api-client in `packages/frontend/src/lib/api.ts` per the slice 8 design decision: the FE keeps one `lib/api.ts` for all endpoints rather than per-feature `api/` sub-folders, so the link CRUD functions live there alongside analytics. The query keys / mutation hooks are co-located in `use-links.ts` per the slice 8 file plan.)*
- [x] 8.2 `components/create-link-form.tsx` — RHF + zodResolver; on 409 `sonner.error("Ese slug ya existe, prueba otro")`. [M] *(slice 9 WU2 — `features/links/create-link-form.tsx` with full TDD coverage: RHF + zodResolver, 409 detail toast, success toast + auto-copy + reset, loading state, client-side + server-side validation handling.)*
- [x] 8.3 `components/{links-table,links-row,empty-state}.tsx` (TanStack Table w/ search/sort/pagination, copy/open/delete) + `routes/links.tsx`. [M] *(slice 9 WU3 + WU4 — `features/links/links-table.tsx` (TanStack Table with all six spec-locked columns, debounced server-side search, client-side sort, server-side pagination, copy/open/delete row actions, loading/empty/error states) and `features/links/links-page.tsx` composing form + table; `routes/index.tsx` re-exports the page. `EmptyState` is the spec-locked `components/ui/empty-state.tsx` primitive from slice 8 WU3. `links-row.tsx` was inlined into the table per the slice 9 orchestrator's "optional extracted row component, or inline in table" guidance — no separate row file needed.)*

## Phase 9: Frontend Analytics feature

- [x] 9.1 `features/analytics/api/analytics-api.ts` + 3 hooks (summary/events/timeseries). [M] *(slice 8 WU4 + slice 10 WU1–WU3 — the FE keeps one `lib/api.ts` for all endpoints rather than per-feature `api/` sub-folders; the 3 analytics hooks live in `packages/frontend/src/hooks/use-analytics.ts` (useAnalyticsSummary, useAnalytics, useTimeseries) and were delivered in slice 8 WU4. Slice 10's WU1–WU3 components consume them directly.)*
- [x] 9.2 `components/{kpi-cards,events-table}.tsx` (TanStack Table w/ filters). [M] *(slice 10 WU1 + WU2 — `features/analytics/kpi-cards.tsx` (4 spec-locked KPI cards: Total Links, Total Clicks, Clicks Today, Clicks Last 7 Days) and `features/analytics/events-table.tsx` (TanStack Table with the 7 spec-locked columns, link/date-range/country filters, debounced link+country inputs, datetime-local date pickers, server-side pagination, and the spec-locked `"(deleted link)"` rendering for soft-deleted-link events). Both components own their loading/empty/error states.)*
- [x] 9.3 `components/timeseries-chart.tsx` (Recharts LineChart; granularity switcher) + `routes/analytics.tsx`. [M] *(slice 10 WU3 + WU4 — `features/analytics/timeseries-chart.tsx` (Recharts `LineChart` + `ResponsiveContainer` with a day/week/month `<select>` granularity switcher; tests mock the recharts surface to assert the data contract in jsdom) and `features/analytics/analytics-page.tsx` composing KPIs + chart + table in the spec-locked order. `routes/analytics.tsx` is now a one-liner re-export of `AnalyticsPage`, replacing the Phase 7 placeholder.)*

## Phase 10: Docker

- [ ] 10.1 `docker/Dockerfile` (multi-stage deps→build→runtime; `node:20-slim`; GeoLite2 optional); `.dockerignore`. [M]
- [ ] 10.2 `docker/docker-compose.yml` (app + postgres + Node 20 fetch healthcheck) + `entrypoint.sh` (migrate → start). [M]

## Phase 11: E2E (Playwright)

- [ ] 11.1 `e2e/create-link.e2e.spec.ts` — form submit → row in table. [M]
- [ ] 11.2 `e2e/redirect-and-analytics.e2e.spec.ts` — visit `/{slug}` → 302 → event in analytics. [M]
- [ ] 11.3 `e2e/delete-link.e2e.spec.ts` — delete → `/{slug}` 404; analytics retains. [M]

## Phase 12: Docs + design cleanup

- [ ] 12.1 `README.md` — description, stack, install, Docker, env vars, architecture, tests, Dokploy; `LICENSE` (MIT); GitHub repo init. [M]
- [ ] 12.2 `design.md` §8 line 462 entropy `1.42×10¹²` → `≈1.3×10¹²`; §FIX 1 line 655 alphabet remove extra `i` to match 54-char §8. [S]

## Order & Parallelization

- Backbone: 0→1→2→3→4→5→6→10. After 1: FE 7 parallel with BE 2–6. After 7: FE 8/9 parallel. Phase 11 needs all; 12 anytime. Apply per `work-unit-commits`: one commit per unit; tests+docs in same commit.
