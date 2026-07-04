# Exploration: ShortPulse URL Shortener — Architecture Decisions

Greenfield URL shortener with React frontend, Fastify backend, PostgreSQL, and analytics. This exploration resolves 12 architectural questions before proposal.

## 1. Monorepo Structure

**Layout:**

```
shortpulse/
├── packages/
│   ├── frontend/          # React SPA (Vite)
│   │   ├── src/
│   │   │   ├── features/  # Feature-based modules (links, analytics)
│   │   │   ├── shared/    # Shared UI components
│   │   │   ├── lib/       # Utilities, API client
│   │   │   └── routes/    # TanStack Router file-based routes
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── backend/           # Fastify API
│   │   ├── src/
│   │   │   ├── domain/    # Entities, value objects, repository interfaces
│   │   │   ├── application/ # Use-case services
│   │   │   ├── infrastructure/ # Drizzle repos, geolocation, UA parsing
│   │   │   ├── presentation/   # Fastify routes/controllers
│   │   │   └── container.ts    # Simple DI container
│   │   ├── drizzle/       # migrations + schema
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/            # Cross-package contract
│       ├── src/
│       │   ├── schemas/   # Zod schemas (request/response validation)
│       │   ├── types/     # TypeScript types derived from Zod
│       │   └── constants/ # Slug config, regex patterns
│       ├── package.json
│       └── tsconfig.json
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

**What goes in `shared`:**

- Zod schemas for all API request/response contracts (`createLinkSchema`, `linkResponseSchema`, `analyticsQuerySchema`, etc.)
- TypeScript types inferred from Zod (`z.infer<typeof createLinkSchema>`)
- Slug validation regex and character set constants
- URL validation logic (shared between FE form validation and BE request validation)

**API contract sharing:** The FE imports `@shortpulse/shared` to validate forms (React Hook Form + Zod resolver) and the BE imports the same package to validate incoming requests. One schema, two consumers. No drift.

---

## 2. Clean/Hexagonal Architecture — Backend Layers

```
┌─────────────────────────────────────────────────────┐
│  Presentation (Fastify routes/plugins)              │
│  ┌───────────────────────────────────────────────┐  │
│  │  Application (CreateLinkService, etc.)        │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  Domain (Link, AnalyticsEvent, slug gen) │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│  Infrastructure (Drizzle repos, Geolocation, UA)    │
└─────────────────────────────────────────────────────┘
```

**Domain layer (`domain/`):**

- `Link` entity: `{ id, originalUrl, slug, createdAt }`
- `AnalyticsEvent` entity: `{ id, linkId, timestamp, ip, userAgent, referer, country, city, browser }`
- `SlugGenerator` — pure function: `generateSlug(length: number): string`
- `SlugValidator` — pure function: `isValidSlug(slug: string): boolean`
- `UrlValidator` — pure function: `isValidUrl(url: string): boolean`
- Repository interfaces: `LinkRepository`, `AnalyticsRepository` (defined here, implemented in infra)

**Application layer (`application/`):**

- `CreateLinkService(linkRepo, slugGen)` — orchestrates link creation, handles custom slug + collision
- `RedirectService(linkRepo, analyticsService)` — looks up slug, triggers analytics, returns redirect target
- `AnalyticsService(analyticsRepo)` — aggregates data for dashboard queries
- `DeleteLinkService(linkRepo)` — soft-delete or hard-delete
- `ListLinksService(linkRepo)` — paginated search with sorting

**Infrastructure layer (`infrastructure/`):**

- `DrizzleLinkRepository` implements `LinkRepository`
- `DrizzleAnalyticsRepository` implements `AnalyticsRepository`
- `MaxMindGeolocator` implements `Geolocator` interface
- `UaParserJsAdapter` implements `UserAgentParser` interface

**Presentation layer (`presentation/`):**

- Fastify plugin per domain: `linksPlugin`, `analyticsPlugin`, `healthPlugin`
- Controllers are thin — parse request, call service, format response

**Dependency injection:** Simple container pattern (no library). A `container.ts` wires concrete implementations to interfaces. Services receive dependencies via constructor. Fastify plugins receive services through `fastify.decorate()`.

```typescript
// container.ts
const linkRepo = new DrizzleLinkRepository(db);
const slugGen = new CryptoSlugGenerator();
const createLinkService = new CreateLinkService(linkRepo, slugGen);
// ... register in Fastify via decorate
```

**Slug generation placement:** Domain layer. It's pure logic with no external dependencies — belongs in `domain/slug-generator.ts`. The shared package can also export the regex/constants for frontend validation.

---

## 3. Slug Generation Strategy

| Decision               | Choice                                                   | Rationale                                                                             |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Character set          | `ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789` | Excludes ambiguous: `0/O`, `1/l/I`, `8/B` confusion reduced. 54 chars.                |
| Algorithm              | `crypto.randomBytes` (Node built-in)                     | No dependency. Cryptographically secure. Nanoid adds a dep for marginal benefit.      |
| Length                 | 7 characters                                             | 54^7 ≈ 1.4 trillion combinations. Collision probability negligible at expected scale. |
| Collision handling     | Retry up to 3 times on unique-constraint violation       | Simple, correct. If 3 retries fail (astronomically unlikely), return error.           |
| Custom slug validation | Regex: `/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,60}[a-zA-Z0-9])?$/` | Letters, numbers, hyphens. No leading/trailing hyphens. 1-62 chars.                   |

**Implementation sketch:**

```typescript
// domain/slug-generator.ts
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateSlug(length = 7): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}
```

---

## 4. Redirect + Analytics Flow (Hot Path)

| Approach                                            | Latency   | Reliability   | Complexity | Testability |
| --------------------------------------------------- | --------- | ------------- | ---------- | ----------- |
| **A) Sync** — write analytics, then 302             | +5-15ms   | Guaranteed    | Low        | High        |
| B) Async fire-and-forget — 302, write in background | 0ms added | Lost on crash | Medium     | Medium      |
| C) Queue — write to queue, worker persists          | 0ms added | Guaranteed    | High       | Low         |

**Recommendation: A) Synchronous write**

Rationale:

- The spec prioritizes simplicity AND correctness ("registrar un evento en analytics" is a requirement, not optional)
- 5-15ms added to a redirect is imperceptible to humans (browser navigation is 100ms+ anyway)
- 90% test coverage target is easier with sync — one code path, no race conditions
- At VPS scale (not millions of RPS), sync PostgreSQL write is fast enough
- No queue infrastructure to maintain or test

**Flow:**

```
GET /:slug
  → RedirectService.getBySlug(slug)
    → NOT FOUND → 404
    → FOUND → get IP, UA, referer from request
    → Geolocator.resolve(ip) → { country, city }
    → AnalyticsService.recordEvent({ linkId, ip, userAgent, referer, country, city })
    → 302 redirect to originalUrl
```

---

## 5. Geolocation (Country/City)

| Option               | Offline      | Cost      | Accuracy | Testability           | Setup            |
| -------------------- | ------------ | --------- | -------- | --------------------- | ---------------- |
| **MaxMind GeoLite2** | ✅ Local DB  | Free      | Good     | High (mock interface) | Download DB file |
| ip-api.com           | ❌ HTTP call | Free      | Good     | Medium                | None             |
| ipinfo.io            | ❌ HTTP call | Free tier | Good     | Medium                | Token            |
| Cloudflare headers   | ✅           | Free      | Good     | Low (CF-dependent)    | Behind CF        |

**Recommendation: MaxMind GeoLite2**

Rationale:

- Offline-capable — no external API dependency at redirect time (critical for latency + reliability)
- Free, well-maintained, widely used
- Local DB file ships in Docker image (updates via cron or rebuild)
- Perfectly testable via interface + dummy implementation

**Testability pattern:**

```typescript
// domain/geolocator.ts
export interface Geolocator {
  resolve(ip: string): Promise<{ country: string | null; city: string | null }>;
}

// infrastructure/maxmind-geolocator.ts
export class MaxMindGeolocator implements Geolocator {
  /* real impl */
}

// tests/dummy-geolocator.ts
export class DummyGeolocator implements Geolocator {
  async resolve() {
    return { country: 'US', city: 'New York' };
  }
}
```

Integration tests use `DummyGeolocator`. A dedicated test can verify `MaxMindGeolocator` against the real DB if needed.

---

## 6. Browser/UA Parsing

**Recommendation: `ua-parser-js`** — popular (~80M weekly npm downloads), maintained, lightweight.

**Storage decision:** Store BOTH raw `user_agent` string AND parsed `browser` name.

- `user_agent` (TEXT) — raw string, future-proof for re-parsing
- `browser` (VARCHAR) — parsed display name (e.g., "Chrome", "Firefox", "Safari")

**Why both:** Raw UA preserves data if parsing logic changes. Parsed browser enables fast queries without re-parsing every row.

```typescript
// infrastructure/ua-parser-adapter.ts
import { UAParser } from 'ua-parser-js';

export interface UserAgentParser {
  parse(uaString: string): { browser: string; os: string; device: string };
}

export class UaParserJsAdapter implements UserAgentParser {
  parse(uaString: string) {
    const parser = new UAParser(uaString);
    const result = parser.getResult();
    return {
      browser: result.browser.name ?? 'Unknown',
      os: result.os.name ?? 'Unknown',
      device: result.device.type ?? 'desktop',
    };
  }
}
```

---

## 7. API Contract

All responses use standard HTTP status codes. Error responses follow RFC 7807 Problem Details.

### Endpoints

| Method   | Path                        | Body/Query                                                   | Response                                                 | Status    |
| -------- | --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | --------- |
| `POST`   | `/api/links`                | `{ original_url, slug? }`                                    | `{ id, original_url, slug, short_url, created_at }`      | 201       |
| `GET`    | `/api/links`                | `?search=&sortBy=created_at&sortDir=desc&page=1&pageSize=20` | `{ data: Link[], total, page, pageSize }`                | 200       |
| `DELETE` | `/api/links/:id`            | —                                                            | —                                                        | 204       |
| `GET`    | `/:slug`                    | —                                                            | 302 redirect to `original_url`                           | 302 / 404 |
| `GET`    | `/api/analytics/summary`    | —                                                            | `{ total_links, total_clicks, clicks_today, clicks_7d }` | 200       |
| `GET`    | `/api/analytics`            | `?link_id=&date_from=&date_to=&country=&page=1&pageSize=20`  | `{ data: Event[], total, page, pageSize }`               | 200       |
| `GET`    | `/api/analytics/timeseries` | `?granularity=day\|week\|month&date_from=&date_to=`          | `{ data: [{ timestamp, count }] }`                       | 200       |
| `GET`    | `/health`                   | —                                                            | `{ status: "ok", db: "connected" }`                      | 200       |

**Note:** `GET /:slug` is NOT under `/api` — it's the public redirect endpoint.

**Zod schemas in `packages/shared`:**

```typescript
// shared/src/schemas/link.ts
export const createLinkSchema = z.object({
  original_url: z.string().url(),
  slug: z
    .string()
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,60}[a-zA-Z0-9])?$/)
    .optional(),
});

export const linkResponseSchema = z.object({
  id: z.string().uuid(),
  original_url: z.string().url(),
  slug: z.string(),
  short_url: z.string().url(),
  created_at: z.string().datetime(),
});
```

---

## 8. Frontend Architecture

**Routes (TanStack Router file-based):**

| Route        | Component       | Purpose                                |
| ------------ | --------------- | -------------------------------------- |
| `/`          | `LinksPage`     | Links table + create form              |
| `/analytics` | `AnalyticsPage` | KPIs + timeseries chart + events table |
| `*`          | `NotFoundPage`  | 404                                    |

**Feature structure:**

```
src/
├── features/
│   ├── links/
│   │   ├── components/    # LinkTable, CreateLinkForm, LinkRow
│   │   ├── hooks/         # useLinks, useCreateLink, useDeleteLink
│   │   ├── api/           # linkApi (fetch wrappers)
│   │   └── schemas/       # re-export from @shortpulse/shared
│   └── analytics/
│       ├── components/    # KpiCards, TimeseriesChart, EventsTable
│       ├── hooks/         # useAnalyticsSummary, useTimeseries, useEvents
│       └── api/           # analyticsApi
├── shared/
│   ├── components/        # Button, Input, Table, Toast, Layout
│   └── lib/               # apiClient (fetch wrapper with error handling)
└── routes/                # TanStack Router route files
```

**Library choices:**

| Concern     | Library                          | Rationale                                                                     |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------- |
| Forms       | React Hook Form + Zod resolver   | Already in stack, integrates with shared Zod schemas                          |
| Toasts      | **sonner**                       | Lightweight (~3KB), modern API, beautiful defaults, zero config               |
| Charts      | **Recharts**                     | Most popular React chart library, composable, good docs, fits dashboard needs |
| HTTP client | Native `fetch` with thin wrapper | No axios dependency for a simple API                                          |

---

## 9. Database Migrations

**Tool:** Drizzle Kit (`drizzle-kit generate` → `drizzle-kit migrate`).

**Docker strategy:** Run migrations BEFORE app starts, in the same container entrypoint.

```dockerfile
# docker/Dockerfile (final stage)
CMD ["sh", "-c", "pnpm drizzle-kit migrate && node dist/server.js"]
```

**Alternative (more robust):** Separate migration step in docker-compose:

```yaml
services:
  migrate:
    build: .
    command: pnpm drizzle-kit migrate
    depends_on: [postgres]
  app:
    build: .
    command: node dist/server.js
    depends_on: [migrate]
```

**Recommendation:** Single container with entrypoint script — simpler for Dokploy deployment. The migration is idempotent (tracks applied migrations in `__drizzle_migrations` table).

---

## 10. Healthcheck Endpoint

```
GET /health → 200 { status: "ok", db: "connected" }
GET /health → 503 { status: "error", db: "disconnected" } (if DB unreachable)
```

**Docker HEALTHCHECK:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

**Implementation:** Fastify route that runs `SELECT 1` against PostgreSQL. If it throws, return 503.

---

## 11. Docker Strategy

**Recommendation: Single container serving both API and frontend SPA.**

| Option                                 | Pros                                                             | Cons                                               |
| -------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| **A) Backend serves SPA static files** | One container, simple Dokploy deploy, no CORS, no separate nginx | Backend serves non-API traffic                     |
| B) Separate containers + nginx         | Clean separation                                                 | More complex for a VPS, needs reverse proxy config |

**Choice: A** — Fastify serves the built frontend as static files. One container, one port, one Dokploy service.

**Multi-stage Dockerfile:**

```dockerfile
# Stage 1: Install deps
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/*/package.json ./packages/*/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build
COPY . .
RUN pnpm build

# Stage 3: Runtime
FROM node:20-slim AS runtime
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=build /app .
RUN pnpm prune --prod
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter backend drizzle-kit migrate && pnpm --filter backend start"]
```

**docker-compose.yml:**

```yaml
services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports: ['3000:3000']
    environment:
      DATABASE_URL: postgres://shortpulse:shortpulse@postgres:5432/shortpulse
      PORT: 3000
      BASE_URL: http://localhost:3000
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 5s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: shortpulse
      POSTGRES_PASSWORD: shortpulse
      POSTGRES_DB: shortpulse
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U shortpulse']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

## 12. Testing Architecture

| Layer           | What to test                                                                 | Tools                                    | Mocking                                   |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| **Unit**        | Slug generation, URL validation, slug validation, service logic, Zod schemas | Vitest                                   | Mock repository interfaces                |
| **Integration** | API endpoints (full HTTP cycle), DB operations, redirect + analytics flow    | Vitest + Fastify inject + testcontainers | Real PostgreSQL, DummyGeolocator, DummyUA |
| **E2E**         | Create link → redirect → analytics visible, delete link, 404                 | Playwright                               | Full docker-compose stack                 |

**Geolocation testing:** Inject `DummyGeolocator` that returns fixed `{ country: 'US', city: 'New York' }` in all integration/unit tests. One optional test verifies `MaxMindGeolocator` against the real DB file.

**Fastify inject testing:**

```typescript
// integration test
const app = await buildApp({ geolocator: new DummyGeolocator() });
const res = await app.inject({
  method: 'POST',
  url: '/api/links',
  payload: { original_url: 'https://example.com' },
});
expect(res.statusCode).toBe(201);
```

**Testcontainers for DB:**

```typescript
let container: StartedPostgreSqlContainer;
let db: DrizzleD1Database;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  db = drizzle(container.getConnectionUri());
  await migrate(db, { migrationsFolder: './drizzle' });
}, 60_000);

afterAll(async () => {
  await container.stop();
});
```

---

## Summary of Recommendations

| Decision      | Choice                                                                |
| ------------- | --------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces: `packages/{frontend,backend,shared}`                 |
| Backend arch  | Clean/Hexagonal: domain → application → infrastructure → presentation |
| DI            | Simple container pattern (no library)                                 |
| Slug gen      | `crypto.randomBytes`, 7 chars, 54-char alphabet, retry on collision   |
| Analytics     | Synchronous write before 302 redirect                                 |
| Geolocation   | MaxMind GeoLite2 (local DB, offline, testable via interface)          |
| UA parsing    | `ua-parser-js`, store raw + parsed browser                            |
| Toast         | sonner                                                                |
| Charts        | Recharts                                                              |
| HTTP client   | Native fetch with thin wrapper                                        |
| DB migrations | Drizzle Kit, run in container entrypoint                              |
| Docker        | Single container (backend serves SPA), multi-stage build              |
| Testing       | Vitest (unit/integration) + Playwright (E2E) + testcontainers         |

## Risks

- **MaxMind DB updates:** GeoLite2 DB needs periodic updates. Mitigate by rebuilding Docker image regularly or adding a cron job to download the latest DB.
- **Single-container tradeoff:** Backend serves static files — not ideal at extreme scale, but correct for a VPS deployment. Easy to split later.
- **Sync analytics latency:** If PostgreSQL is under load, redirect latency increases. At VPS scale this is acceptable; at scale, move to async.

## Ready for Proposal

**Yes.** All 12 architectural questions are resolved with concrete recommendations. The orchestrator should proceed to `sdd-propose` to formalize the change scope and approach.
