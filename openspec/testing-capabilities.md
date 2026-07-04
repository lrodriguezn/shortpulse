# Testing Capabilities — ShortPulse

**Strict TDD Mode**: enabled  
**Detected**: 2026-07-04

## Test Runner

- **Command**: `pnpm test` (root), `pnpm --filter backend test`, `pnpm --filter frontend test`
- **Framework**: Vitest (unit + integration), Playwright (E2E)

## Test Layers

| Layer       | Available | Tool                          |
| ----------- | --------- | ----------------------------- |
| Unit        | ✅        | Vitest + @vitest/coverage-v8  |
| Integration | ✅        | Vitest + light-my-request (Fastify injection) + testcontainers (PostgreSQL) |
| E2E         | ✅        | Playwright                    |

## Coverage

- **Available**: ✅
- **Command**: `pnpm test -- --coverage`
- **Threshold**: 90% (enforced in CI)

## Quality Tools

| Tool         | Available | Command                  |
| ------------ | --------- | ------------------------ |
| Linter       | ✅        | `pnpm lint`              |
| Type checker | ✅        | `pnpm typecheck`         |
| Formatter    | ✅        | `pnpm format`            |

## TDD Workflow

1. **RED**: Write failing test → run `pnpm test` → confirm failure
2. **GREEN**: Write minimal code to pass → run `pnpm test` → confirm pass
3. **REFACTOR**: Clean up → run `pnpm test` → confirm still green
4. **Coverage check**: `pnpm test -- --coverage` → must be ≥ 90%

## Test Categories

### Unit Tests
- Slug generation (random, custom, validation)
- URL validation (Zod schemas)
- Repository interfaces (mock implementations)
- Service logic (business rules, error handling)
- Utility functions (date formatting, analytics aggregation)

### Integration Tests
- API endpoints (Fastify injection via `light-my-request`)
- Database operations (testcontainers PostgreSQL)
- Redirect flow with analytics registration
- CRUD operations for links and analytics

### E2E Tests (Playwright)
- Create link flow (form submission, validation, success toast)
- Redirect + analytics registration (visit short URL, verify analytics event)
- Delete link (confirm modal, verify removal from table)
- Analytics dashboard (KPIs, table filters, charts)
- 404 page (invalid slug, error message, navigation back)

## Coverage Requirements

- **Minimum**: 90% across all packages
- **Critical paths**: redirect endpoint, slug generation, analytics registration (aim for 100%)
- **Exclusions**: UI components (coverage tracked separately), configuration files, type definitions
