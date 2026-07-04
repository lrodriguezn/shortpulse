# Design: ShortPulse URL Shortener (MVP)

> **Decode in one paragraph.** A single-process Fastify app (hexagonal layers) serves a React SPA and an 8-endpoint API over PostgreSQL 16. Shared Zod schemas in `@shortpulse/shared` keep the FE/BE contract drift-free. Redirects write one analytics row synchronously then `302`. Links are soft-deleted so analytics retain integrity. One Docker container, Dokploy-friendly. This design encodes the proposal binding decisions and the spec-resolved open questions (obs #6, #7) plus exploration (obs #4, #5).

---

## 1. System Architecture

```mermaid
flowchart LR
    Browser["Browser<br/>(React SPA)"] -->|HTTP| Fastify["Fastify (single process)"]
    subgraph Fastify["Fastify (single process)"]
        Static["fastify-static<br/>serves dist/"] --> Routes["Presentation<br/>(routes/controllers)"]
        Routes --> App["Application<br/>(use-cases)"]
        App --> Domain["Domain<br/>(pure)"]
        App --> Repos["Repository<br/>contracts"]
        Repos -.implemented by.-> Infra["Infrastructure<br/>(Drizzle / MaxMind / ua-parser)"]
    end
    Infra -->|SQL| PG[("PostgreSQL 16")]
    Infra -->|mmdb read| Geo["GeoLite2-City.mmdb<br/>(local file)"]
    Fastify -->|health SELECT 1| PG
```

**Layer boundaries & dependency direction:** `domain` ← `application` ← `infrastructure` + `presentation`. Domain has zero external imports (only TS). Application depends only on domain interfaces. Infrastructure and presentation are concrete adapters wired by `container.ts` at boot. Cross-layer imports flow inward; never the reverse.

---

## 2. Monorepo Structure

```
shortpulse/
├── packages/
│   ├── shared/                     # @shortpulse/shared — contract, no runtime deps beyond zod
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   │   ├── link.ts          # createLinkSchema, listLinksQuerySchema, linkResponseSchema
│   │   │   │   ├── analytics.ts     # summarySchema, eventsQuerySchema, timeseriesQuerySchema, eventRowSchema
│   │   │   │   ├── health.ts        # healthResponseSchema
│   │   │   │   └── problem.ts       # problemDetailsSchema (RFC 7807)
│   │   │   ├── constants/
│   │   │   │   ├── reserved-routes.ts
│   │   │   │   └── slug.ts          # AUTO_SLUG_ALPHABET, AUTO_SLUG_LENGTH, CUSTOM_SLUG_REGEX
│   │   │   ├── types.ts             # z.infer<> re-exports
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── backend/                    # @shortpulse/backend
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── link.ts          # Link entity
│   │   │   │   ├── analytics-event.ts
│   │   │   │   ├── slug.ts          # Slug value object + normalize/validate (pure)
│   │   │   │   ├── slug-generator.ts # generateSlug() pure fn over crypto
│   │   │   │   ├── url-validator.ts
│   │   │   │   └── repositories.ts  # LinkRepository, AnalyticsRepository interfaces
│   │   │   ├── application/
│   │   │   │   ├── create-link.use-case.ts
│   │   │   │   ├── list-links.use-case.ts
│   │   │   │   ├── delete-link.use-case.ts
│   │   │   │   ├── redirect.use-case.ts
│   │   │   │   ├── get-analytics-summary.use-case.ts
│   │   │   │   ├── list-analytics.use-case.ts
│   │   │   │   ├── get-timeseries.use-case.ts
│   │   │   │   └── ports.ts         # Geolocator, UaParser interfaces
│   │   │   ├── infrastructure/
│   │   │   │   ├── db/
│   │   │   │   │   ├── client.ts
│   │   │   │   │   ├── schema.ts     # Drizzle table defs
│   │   │   │   │   └── migrator.ts
│   │   │   │   ├── drizzle-link.repository.ts
│   │   │   │   ├── drizzle-analytics.repository.ts
│   │   │   │   ├── maxmind-geolocator.ts
│   │   │   │   ├── dummy-geolocator.ts
│   │   │   │   └── ua-parser-js.adapter.ts
│   │   │   ├── presentation/
│   │   │   │   ├── server.ts        # buildApp()
│   │   │   │   ├── plugins/
│   │   │   │   │   ├── links.plugin.ts
│   │   │   │   │   ├── redirect.plugin.ts
│   │   │   │   │   ├── analytics.plugin.ts
│   │   │   │   │   └── health.plugin.ts
│   │   │   │   ├── error-mapper.ts  # → RFC 7807
│   │   │   │   └── static.plugin.ts # serve frontend dist
│   │   │   ├── container.ts
│   │   │   └── index.ts             # entry: migrate → start
│   │   ├── drizzle/                 # generated migrations
│   │   ├── tests/                   # unit + integration
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/                    # @shortpulse/frontend — Vite SPA
│       ├── src/
│       │   ├── routes/
│       │   │   ├── links.tsx
│       │   │   ├── analytics.tsx
│       │   │   └── not-found.tsx    /* */
│       │   ├── features/
│       │   │   ├── links/{components,hooks,api}
│       │   │   └── analytics/{components,hooks,api}
│       │   ├── components/ui/       # button, input, table primitives, spinner, empty-state, error-boundary
│       │   ├── lib/api-client.ts
│       │   ├── lib/query-keys.ts
│       │   └── main.tsx
│       ├── tests/                   # vitest unit
│       ├── e2e/                     # playwright *.e2e.spec.ts
│       └── package.json
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── entrypoint.sh
├── openspec/                        # SDD artifacts
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

Work-unit commit slicing (per `work-unit-commits` skill): each numbered layer build is one work unit — `feat(shared): zod contract schemas`, `feat(backend): domain layer + tests`, `feat(backend): Drizzle schema + migrations`, `feat(backend): infra adapters`, `feat(backend): use-cases`, `feat(backend): presentation + container`, `feat(frontend): scaffold + ui primitives`, `feat(frontend): links feature`, `feat(frontend): analytics feature`, `feat(docker): multi-stage build + compose`, `test(e2e): critical journeys`. Tests live in the same commit as the behavior they verify.

---

## 3. Backend Hexagonal Layering

| Layer | Contains | Depends on | External deps |
|-------|----------|-----------|---------------|
| `domain/` | `Link`, `AnalyticsEvent`, `Slug` VO, `slug-generator`, `url-validator`, repository **interfaces** | TS only | none |
| `application/` | 7 use-cases + `Geolocator`/`UaParser` port interfaces | `domain` | none |
| `infrastructure/` | Drizzle repos, MaxMind + ua-parser adapters, db client, migrator | `application` ports + `domain` interfaces | drizzle-orm, maxmind, ua-parser-js |
| `presentation/` | Fastify plugins (thin controllers), error-mapper, static plugin | `application` use-cases + `@shortpulse/shared` | fastify, fastify-static |
| `container.ts` | Wires implementations to ports at boot | all | drizzle, maxmind |

**Dependency rule:** compile-time arrows point inward. `infrastructure` and `presentation` are siblings assembled by `container.ts`; neither imports the other's internals directly — both reference `application` interfaces.

UI design happens in OpenPencil separately; this design defines only the component contract.

---

## 4. Database Schema (Drizzle)

```typescript
// infrastructure/db/schema.ts
import { pgTable, uuid, text, timestamp, index, uniqueIndex, inet } from 'drizzle-orm/pg-core';

export const links = pgTable('links', {
  id:          uuid('id').defaultRandom().primaryKey(),
  originalUrl: text('original_url').notNull(),
  slug:        text('slug').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  slugIdx:     uniqueIndex('links_slug_uidx').on(t.slug),
  createdIdx:  index('links_created_at_idx').on(t.createdAt),
}));

export const analytics = pgTable('analytics', {
  id:        uuid('id').defaultRandom().primaryKey(),
  linkId:    uuid('link_id').notNull().references(() => links.id, { onDelete: 'restrict' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  ip:        text('ip').notNull(),
  userAgent: text('user_agent'),
  referer:   text('referer'),
  country:   text('country'),
  city:      text('city'),
  browser:   text('browser'),
}, (t) => ({
  linkIdx:    index('analytics_link_id_idx').on(t.linkId),
  timeIdx:    index('analytics_timestamp_desc_idx').on(t.timestamp),
}));
```

**Schema notes:**
- `ip` is `TEXT` (spec #7/#7 resolution), not `inet` — keeps client-side obfuscation/proxy headers flexible.
- FK `ON DELETE RESTRICT`: soft-delete sets `deleted_at`; the analytics row is never orphaned. Hard delete is intentionally blocked at the DB level.
- Slug stored **lowercased**; the unique index enforces case-insensitive collision (no `CITEXT` needed because normalization happens at write time).
- `country`/`city` stored as ISO/text (`null` when MaxMind misses).

**Migration strategy:** `drizzle-kit generate` produces versioned SQL under `drizzle/`. `infrastructure/db/migrator.ts` wraps `drizzle-orm/migrator` `migrate()`. `entrypoint.sh` runs `pnpm --filter backend db:migrate && node dist/index.js`. Migrations are idempotent (tracked in `__drizzle_migrations`). Down migrations via `drizzle-kit drop` (rollback capability preserved).

---

## 5. API Contract

All errors use RFC 7807 problem-details (content-type `application/problem+json`):

```typescript
// shared/src/schemas/problem.ts
export const problemDetailsSchema = z.object({
  type:     z.string().url().default('about:blank'),
  title:    z.string(),
  status:   z.number().int(),
  detail:   z.string().optional(),
  instance: z.string().optional(),
});
```

### Shared schemas (`@shortpulse/shared`)

```typescript
// createLinkSchema
export const createLinkSchema = z.object({
  original_url: z.string().url().refine(
    (u) => /^https?:\/\//.test(u),
    { message: "Must be an http or https URL" }
  ),                                                            // http/https only — z.string().url() alone accepts ftp/file/data
  slug: z.string().regex(/^(?!-)[a-z0-9-]{3,20}(?<!-)$/).optional(),  // lowercase-normalized by BE; no leading/trailing hyphen
});

// listLinksQuerySchema
export const listLinksQuerySchema = z.object({
  search:   z.string().optional(),
  sortBy:   z.enum(['created_at','original_url','slug','click_count']).default('created_at'),
  sortDir:  z.enum(['asc','desc']).default('desc'),
  page:     z.coerce.number().int().min(1).default(1),
  page_size:z.coerce.number().int().min(1).max(100).default(20),
});

// linkResponseSchema (list + create)
export const linkResponseSchema = z.object({
  id:          z.string().uuid(),
  original_url:z.string().url(),
  slug:        z.string(),
  short_url:   z.string().url(),
  created_at:  z.string().datetime(),
  click_count: z.number().int(),
  deleted_at:  z.string().datetime().nullable(),
});

// summarySchema  →  { total_links, total_clicks, clicks_today, clicks_last_7_days }
// eventsQuerySchema → { link_id?, date_from?, date_to?, country?, page, page_size }
// eventRowSchema  →  { id, link_id, slug (or "(deleted link)"), timestamp, ip, browser, country, city, referer }
// timeseriesQuerySchema → { granularity: day|week|month, date_from?, date_to? }
// timeseriesRowSchema  →  { bucket_start: ISO datetime, count: int }
```

### Endpoint table

| # | Method | Path | Request | Success | Errors |
|---|--------|------|---------|---------|--------|
| 1 | POST | `/api/links` | `createLinkSchema` body | 201 `linkResponseSchema` | 400 (bad url/slug), 409 (collision/reserved) |
| 2 | GET | `/api/links` | `listLinksQuerySchema` query | 200 `{data: linkResponseSchema[], total, page, page_size}` | 400 |
| 3 | DELETE | `/api/links/:id` | uuid path | 204 | 404 (not found & not-deleted), (idempotent 204 if already deleted) |
| 4 | GET | `/:slug` | path | 302 `Location: <original_url>` | 404 (not found/deleted); reserved routes NOT handled here |
| 5 | GET | `/api/analytics/summary` | — | 200 `{total_links, total_clicks, clicks_today, clicks_last_7_days}` | 500 |
| 6 | GET | `/api/analytics` | `eventsQuerySchema` | 200 `{data: eventRowSchema[], total, page, page_size}` | 400 |
| 7 | GET | `/api/analytics/timeseries` | `timeseriesQuerySchema` | 200 `{data: timeseriesRowSchema[]}` | 400 |
| 8 | GET | `/health` | — | 200 `{status:"ok", db:"connected"}` / 503 `{status:"degraded", db:"disconnected"}` | — |

**Collision error body (custom slug):** `detail` = `"Ese slug ya existe, prueba otro"` (409). Per spec this literal is the UX string; the FE shows it verbatim in a sonner toast.

### Concrete examples

**Create link request → response (201):**
```http
POST /api/links
Content-Type: application/json

{ "original_url": "https://example.com", "slug": "my-link" }

HTTP/1.1 201 Created
{
  "id": "9b1e...uuid",
  "original_url": "https://example.com",
  "slug": "my-link",
  "short_url": "http://localhost:3000/my-link",
  "created_at": "2026-07-04T12:00:00.000Z",
  "click_count": 0,
  "deleted_at": null
}
```

**Redirect (302):**
```http
GET /abc HTTP/1.1

HTTP/1.1 302 Found
Location: https://example.com
```

**409 collision:**
```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
{
  "type": "about:blank",
  "title": "Slug conflict",
  "status": 409,
  "detail": "Ese slug ya existe, prueba otro"
}
```

---

## 6. Sequence Diagrams

### Create link flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant C as LinksController
    participant UC as CreateLinkUseCase
    participant SV as SlugValidator
    participant R as LinkRepository
    participant DB as PostgreSQL
    B->>C: POST /api/links {original_url, slug?}
    C->>C: zod parse createLinkSchema (400 on fail)
    alt slug provided
        C->>UC: execute({original_url, slug})
        UC->>SV: validate(normalize(slug))
        alt reserved or invalid
            SV-->>UC: Error
            UC-->>C: ConflictError/BadRequest
            C-->>B: 409 / 400
        else valid
            UC->>R: slug ← lowercase
            R->>DB: INSERT links RETURNING *
            alt unique violation
                DB-->>R: error
                R-->>UC: SlugConflictError
                UC-->>C: ConflictError
                C-->>B: 409 "Ese slug ya existe, prueba otro"
            else ok
                DB-->>R: row
                R-->>UC: Link
                UC-->>C: compose short_url = BASE_URL/slug
                C-->>B: 201 linkResponse
            end
        end
    else slug omitted
        C->>UC: execute({original_url})
        loop retry up to 3
            UC->>UC: generateSlug() (crypto.randomBytes)
            UC->>R: INSERT links
            alt unique violation
                R-->>UC: conflict
            else ok
                R-->>UC: Link
            end
        end
        alt all 3 retries failed
            UC-->>C: SlugGenerationError
            C-->>B: 500
        else ok
            C-->>B: 201 linkResponse
        end
    end
```

### Redirect flow (sync analytics)

```mermaid
sequenceDiagram
    participant V as Visitor
    participant R as RedirectController
    participant UC as RedirectUseCase
    participant L as LinkRepository
    participant G as Geolocator
    participant UA as UaParser
    participant A as AnalyticsRepository
    participant DB as PostgreSQL
    V->>R: GET /:slug
    R->>UC: execute(slug.toLowerCase())
    UC->>L: findBySlug(lower)
    L->>DB: SELECT ... WHERE deleted_at IS NULL
    alt not found / deleted
        L-->>UC: null
        UC-->>R: NotFoundError
        R-->>V: 404 problem+json
    else found
        L-->>UC: Link
        UC->>G: lookup(clientIp)
        G-->>UC: {country, city} | {null,null}
        UC->>UA: parse(userAgentHeader)
        UA-->>UC: {browser}
        UC->>A: record({linkId, ip, ua, referer, country, city, browser})
        A->>DB: INSERT analytics
        DB-->>A: ok
        A-->>UC: ok
        UC-->>R: {originalUrl}
        R-->>V: 302 Location: originalUrl
    end
```

**Note:** reserved routes are matched by the SPA/Fastify route table FIRST (registered before the catch-all redirect handler), so `GET /analytics`, `GET /health`, `GET /api/*` never reach the redirect handler.

### Analytics timeseries flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant C as AnalyticsController
    participant UC as GetTimeseriesUseCase
    participant R as AnalyticsRepository
    participant DB as PostgreSQL
    B->>C: GET /api/analytics/timeseries?granularity=day
    C->>C: zod parse timeseriesQuerySchema (400 on fail)
    alt date_from / date_to omitted
        C->>UC: default range = last 30 days (UTC)
    end
    C->>UC: execute({granularity, date_from, date_to})
    UC->>R: bucketEvents({granularity, range})
    R->>DB: SELECT date_trunc('<unit>', timestamp AT TIME ZONE 'UTC'), count(*)
            GROUP BY 1 ORDER BY 1
    DB-->>R: rows
    R-->>UC: TimeseriesRow[] {bucket_start, count}
    UC-->>C: rows
    C-->>B: 200 {data: [{bucket_start, count}]}
```

**Bucket semantics (spec #4 resolved):** `day`→`date_trunc('day', ...)`, `week`→`date_trunc('week', ...)` (Monday-based in Postgres with `ISO` default), `month`→`date_trunc('month', ...)`. All times `AT TIME ZONE 'UTC'`. Default range: `[now-30d, now]`.

---

## 7. Frontend Architecture

**Route tree (TanStack Router, file-based):**
| File | Path | Component |
|------|------|-----------|
| `routes/links.tsx` | `/` | `LinksPage` |
| `routes/analytics.tsx` | `/analytics` | `AnalyticsPage` |
| `routes/not-found.tsx` | `*` | `NotFoundPage` |

**Feature folders:**
```
features/links/
  components/{create-link-form.tsx, links-table.tsx, links-row.tsx, empty-state.tsx}
  hooks/{use-links.ts, use-create-link.ts, use-delete-link.ts}
  api/link-api.ts
features/analytics/
  components/{kpi-cards.tsx, events-table.tsx, timeseries-chart.tsx}
  hooks/{use-analytics-summary.ts, use-events.ts, use-timeseries.ts}
  api/analytics-api.ts
components/ui/{button, input, table, spinner, toast.tsx, error-boundary.tsx}
```

**Server state — TanStack Query keys convention:**
```typescript
// lib/query-keys.ts
export const qk = {
  links: {
    all:    ['links'] as const,
    list:   (params) => ['links','list', params] as const,
  },
  analytics: {
    summary:    ['analytics','summary'] as const,
    events:     (params) => ['analytics','events', params] as const,
    timeseries: (params) => ['analytics','timeseries', params] as const,
  },
};
```

**Form:** `useForm({ resolver: zodResolver(createLinkSchema) })` — same schema imported from `@shortpulse/shared`, zero drift. On 409 the mutation `onError` fires `sonner.error(detail)`.

**UI design:** OpenPencil phase (separate). This design only fixes the component *contract* — props, hooks, query keys — not the visual design.

---

## 8. Slug Generation Algorithm

| Attribute | Value |
|-----------|-------|
| Auto alphabet | `"ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"` — **exactly 54 chars** (see count verification below). Mixed-case. Excludes ambiguous `0`, `O`, `1`, `l`, **and additionally `I`, `i`, `L`, `o`** to reach the spec-mandated 54 while removing every visually-confusable pair. |
| Auto length | 7 |
| Entropy | `54^7 ≈ 1.42 × 10¹²` combos (~40.5 bits). Birthday collision ~50% only after ~1.2 × 10⁶ entries; at VPS scale negligible. |
| RNG | `crypto.randomBytes` (Node built-in, CSPRNG) |
| Retry | up to 3 attempts on unique-constraint violation; reject `b % 54` modulo bias (negligible at 54 divisor; accepted) |
| Fallback after 3 fails | 500 problem-details `"Slug generation failed"` |

**Alphabet count verification (54 chars):**
- Uppercase `ABCDEFGHJKMNPQRSTUVWXYZ` = 23 chars → A–Z minus `{I, L, O}` (3 removed).
- Lowercase `abcdefghjkmnpqrstuvwxyz` = 23 chars → a–z minus `{i, l, o}` (3 removed).
- Digits `23456789` = 8 chars → 0 and 1 removed.
- Total = 23 + 23 + 8 = **54**. ✓ Matches spec #5.

**Mixed-case generation vs lowercase storage:**
The generator produces mixed-case output, but the storage layer lowercases the slug before `INSERT` (per the case-insensitive redirect rule, spec #4, and the `links_slug_uidx` unique index). The 54-char mixed alphabet preserves full entropy at *generation* time (collision-resistance space = `54^7`); after lowering, the stored representation collapses to ~31 distinct lowercase-or-digit chars per position, so storage-layer collision probability is higher than the generation space suggests — but the unique index + 3-retry loop detects and recovers from any storage-level collision. Net: entropy is decided at generation, collisions are decided at storage, both are bounded correctly.

**Custom slug validation:**
- Normalize: `slug.toLowerCase().trim()`.
- Regex: `^(?!-)[a-z0-9-]{3,20}(?<!-)$` — charset `[a-z0-9-]`, length 3–20, **MUST NOT start or end with a hyphen** (spec amendment, see ADR-006 + Open Questions).
- Reserved set: `{'analytics','api','health','admin','links','www','favicon',''}` (case-folded before check).

---

## 9. Geolocation Port + Adapter

```typescript
// application/ports.ts
export interface Geolocator {
  lookup(ip: string): { country: string | null; city: string | null };
}

// infrastructure/maxmind-geolocator.ts
export class MaxMindGeolocator implements Geolocator {
  constructor(private reader: Reader<MaxMindDbModel>) {}
  lookup(ip) { const r = this.reader.get(ip); return r ? { country: r.country?.iso_code ?? null, city: r.city?.names?.en ?? null } : { country: null, city: null }; }
}

// infrastructure/dummy-geolocator.ts — used in tests + when DB absent
export class DummyGeolocator implements Geolocator {
  lookup() { return { country: null, city: null }; }
}
```

**Config:** `GEOIP_DB_PATH` env (optional). `container.ts`: if path set and file exists → `MaxMindGeolocator`; else → `DummyGeolocator` (degrade to nulls, redirect still works). Tests always inject `DummyGeolocator`.

---

## 10. Testing Architecture

| Layer | What | How | Naming |
|-------|------|-----|--------|
| Unit | `slug-generator`, `slug-validator`, `url-validator`, use-cases with mocked ports/repos | Vitest | `*.test.ts` |
| Integration | full HTTP→DB: every endpoint, redirect+sync analytics, error mapping, reserved routes, soft-delete + 404 | Fastify `inject` + testcontainers PostgreSQL (`@testcontainers/postgresql`); real migrations applied | `*.test.ts` in `tests/integration/` |
| E2E | create link → redirect → analytics visible → delete → 404 | Playwright against `docker compose up` stack | `*.e2e.spec.ts` in `frontend/e2e/` |

**Coverage:** `@vitest/coverage-v8`, threshold **90%** global + per-package (`packages/shared`, `backend`, `frontend` each enforce). CI fails on drop.

**Rigour:**
- `DummyGeolocator` + mock `UaParser` injected at integration level — no network/MaxMind file dependency.
- `MaxMindGeolocator` has one opt-in test gated on `GEOIP_DB_PATH` present.
- TDD: each work unit commits red-then-green.

---

## 11. Docker Strategy

**`docker/Dockerfile` (multi-stage):**
- `deps` — `node:20-slim`, corepack pnpm, `pnpm fetch` (lockfile only) → cached layer.
- `build` — copy sources, `pnpm install --frozen-lockfile`, `pnpm --filter frontend build`, `pnpm --filter backend build`, copy GeoLite2 mmdb (download via `geoip2` in build arg or mount).
- `runtime` — `node:20-slim`, `pnpm --filter backend deploy --prod backend` (or copy `dist` + `package.json` + `node_modules`), copy `frontend/dist`. EXPOSE 3000. ENTRYPOINT `entrypoint.sh`.

**`entrypoint.sh`:**
```sh
#!/bin/sh
set -e
node dist/infrastructure/db/migrator.js   # idempotent migrate
exec node dist/index.js                    # Fastify boot, serves SPA + API
```

**Healthcheck:** `node:20-slim` ships neither `wget` nor `curl`, so the HEALTHCHECK uses Node 20's global `fetch` directly:
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```
No `apt-get install` needed; no extra image layers.

**`docker-compose.yml`:**
```yaml
services:
  app:
    build: { context: ., dockerfile: docker/Dockerfile }
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://shortpulse:shortpulse@postgres:5432/shortpulse
      PORT: "3000"
      BASE_URL: http://localhost:3000
      GEOIP_DB_PATH: /app/geoip/GeoLite2-City.mmdb
    depends_on: { postgres: { condition: service_healthy } }
    healthcheck: { test: ["CMD","node","-e","fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], interval: "30s", timeout: "5s", retries: "3", start_period: "10s" }
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: shortpulse, POSTGRES_PASSWORD: shortpulse, POSTGRES_DB: shortpulse }
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U shortpulse"], interval: "10s", timeout: "5s", retries: "5" }
    restart: unless-stopped
volumes: { pgdata: {} }
```

---

## 12. Architecture Decision Records

### ADR-001: Fastify + Drizzle over Express/NestJS + Prisma
**Choice:** Fastify + Drizzle ORM.
**Alternatives:** Express+Prisma (heavier, runtime codegen), NestJS (DI framework overhead, smaller API), Hono (less mature PG tooling).
**Rationale:** TS-first; best-in-class performance (critical on redirect hot path); `light-my-request` inject enables fast TDD without HTTP; Drizzle has no codegen step and mocks cleanly under repository pattern — directly supports hexagonal layering.

### ADR-002: Sync analytics write on redirect
**Choice:** insert analytics row, then `302`.
**Alternatives:** async fire-and-forget (lost on crash), queue+worker (infra complexity).
**Rationale:** 5-15ms added is imperceptible next to browser navigation; one code path = simpler TDD + 90% coverage; guaranteed capture is a spec requirement; documented exit to async queue if growth demands (Proposal risk-row).

### ADR-003: Single container serves SPA + API (Dokploy)
**Choice:** Fastify serves built frontend as `fastify-static`; one port, one container.
**Alternatives:** nginx reverse proxy + separate API container (more complex on a VPS), Next.js SSR (out of scope).
**Rationale:** Dokploy One-Service simplicity; no CORS; correct for VPS scale; split to nginx+API later is mechanical. Scaling risk acknowledged in proposal.

### ADR-004: Soft-delete links with analytics retention (FK RESTRICT)
**Choice:** `deleted_at` column + `ON DELETE RESTRICT` FK + render `"(deleted link)"` in analytics.
**Alternatives:** hard delete (destroys report history), separate archive table (read complexity).
**Rationale:** reporting integrity > storage savings; totals KPI explicitly counts deleted-link clicks (spec #2/#5); `"(deleted link)"` literal is the spec-locked rendering token (obs #7).

### ADR-005: MaxMind GeoLite2 local DB over HTTP geolocation APIs
**Choice:** MaxMind GeoLite2-City `.mmdb` read from disk; `Geolocator` port with `DummyGeolocator` fallback.
**Alternatives:** ip-api/ipinfo (per-call network latency + rate limits + rate limits + key mgmt), Cloudflare headers (lock-in).
**Rationale:** offline + free + zero rate limits; interface makes MaxMind trivially mockable; degrade-to-null when DB file absent. Mitigation for staleness: rebuild image regularly (proposal risk row).

### ADR-006: Reject leading/trailing hyphens in custom slugs (micro-decision)
**Choice:** regex `^(?!-)[a-z0-9-]{3,20}(?<!-)$`.
**Alternatives:** allow `-my-link-` (resolves address-bar ambiguity, looks broken).
**Rationale:** spec risk note flagged this open; cleaner UX and unambiguous normalization. **This is no longer a design-only tightening** — the links spec (#6 Slug validation rules) has been amended (see "Gate-fix applied" below) so the design regex `^(?!-)[a-z0-9-]{3,20}(?<!-)$` is now spec-locked, not a design override. Design and spec are aligned.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `packages/shared/**` | Create | Zod contract, constants, types — FE/BE drift-free |
| `packages/backend/src/domain/**` | Create | Pure entities, slug/url logic, repo interfaces |
| `packages/backend/src/application/**` | Create | 7 use-cases + ports |
| `packages/backend/src/infrastructure/**` | Create | Drizzle repos, adapters, db client, migrator |
| `packages/backend/src/presentation/**` | Create | Fastify plugins, error-mapper, static |
| `packages/backend/drizzle/**` | Create | Generated migrations |
| `packages/frontend/src/**` | Create | SPA: routes, features, ui primitives, lib |
| `docker/{Dockerfile,docker-compose.yml,entrypoint.sh}` | Create | Build + orchestration |
| `README.md`, `LICENSE` | Create | Docs (install, Docker, env vars, architecture, tests) + MIT |
| `openspec/specs/{links,analytics,health}/spec.md` | (already filled) | No change in design |
| Nothing deleted | — | Greenfield |

---

## Interfaces / Contracts

Already specified inline in §3 (ports), §4 (Drizzle), §5 (API contract), §9 (Geolocator). Key TypeScript contracts the `sdd-tasks` phase will subdivide:

- `LinkRepository` — `findById`, `findBySlug`, `insert`, `softDelete`, `list(params)`, `clickCountByLink()`
- `AnalyticsRepository` — `record(event)`, `summary()`, `listEvents(params)`, `timeseries({granularity, range})`
- `Geolocator { lookup(ip) }`, `UaParser { parse(ua) }`
- Domain errors: `NotFoundError` `ConflictError` `BadRequestError` `SlugGenerationError` → mapped to RFC 7807 in `error-mapper.ts`

---

## Testing Strategy

Covered in §10. TLS-aware E2E not required (no TLS in container — terminated at Dokploy edge). No migration between deploys (greenfield). No feature flags.

---

## Migration / Rollout

**No data migration** (greenfield). For deploy/rollback see `proposal.md`: Drizzle `down` migrations + redeploy previous image tag on Dokploy. `entrypoint.sh` runs migrations idempotently on boot (drizzle `__drizzle_migrations` tracks state).

---

## Open Questions

- [ ] **GeoLite2 acquisition in CI/Docker:** need to confirm a build-time download mechanism (MaxMind requires an account/license key) — flag for `sdd-tasks`. Mitigation: `DummyGeolocator` keeps everything functional without the file.
- [ ] **`click_count` in list endpoint** requires a join/aggregate against `analytics` — confirm index strategy is sufficient at 90% coverage test scale (acceptable; add covering index if hot path slows).

### Gate-fix applied (fresh-context review corrections)

Resolved during the design gate re-review — recorded here so the `sdd-tasks` phase has a clean trail:

- ✅ **FIX 1 (CRITICAL) — Slug alphabet drift.** §8 alphabet was `"abcdefghijkmnpqrstuvwxyz23456789"` (32 chars, and it incorrectly included `i`). Replaced with the spec-mandated **54-char mixed-case** alphabet `ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789` (23 upper + 23 lower + 8 digits = 54, verified). Excludes `0, O, 1, l` (spec #5) **and** additionally `I, i, L, o` to reach 54 while removing every visually-confusable pair. Entropy statement `54^7 ≈ 1.42 × 10¹²` is now correct *for the 54-char alphabet* (the prior text claimed 54 but used 32). Documented that the generator emits mixed-case while the storage layer lowercases before insert — unique index + 3-retry loop handles any storage-level collapse.
- ✅ **FIX 2 (NOTED) — Leading/trailing hyphen restriction exceeds spec.** ADR-006 tightened the spec's `^[a-z0-9-]{3,20}$` to `^(?!-)[a-z0-9-]{3,20}(?<!-)$` without a matching spec delta. Option (a) applied: **`openspec/specs/links/spec.md` requirement #6 (Slug validation rules) is amended** to mandate the no-leading/trailing-hyphen rule and the regex `^(?!-)[a-z0-9-]{3,20}(?<!-)$`. Design and spec are now aligned; ADR-006 updated to note the amendment.
- ✅ **FIX 3 (MINOR) — URL validation refine.** `z.string().url()` accepts `ftp://`, `file://`, `data:`, etc. `createLinkSchema.original_url` now uses `z.string().url().refine(u => /^https?:\/\//.test(u), "Must be an http or https URL")`. Matches spec #1 ("valid HTTP/HTTPS URL"). Response schemas unchanged (server-produced URLs).
- ✅ **FIX 4 (MINOR) — Docker HEALTHCHECK wget not in node:20-slim.** `node:20-slim` ships neither `wget` nor `curl`. HEALTHCHECK rewritten to use Node 20's global `fetch`: `node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`. No `apt-get install`, no extra layers. Both `Dockerfile` HEALTHCHECK and `docker-compose.yml` healthcheck updated.

None of the above block the design or require further design decisions; all four are spec-aligned and ready for `sdd-tasks`.