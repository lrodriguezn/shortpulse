# Tasks: UI Alignment — Implementation

> **Estimate**: ~191 lines changed (well under 400 — no split needed)

## Batch 1: Foundation

### 1.1 Extend `tailwind.config.ts` — boxShadow + fontSize

**File**: `packages/frontend/tailwind.config.ts`

Add `boxShadow` and `fontSize` extensions inside the existing `theme.extend` block (lines 7-33).

**Before** (line 12-33):
```typescript
      colors: {
        sp: {
          bg: 'var(--sp-bg)',
          'bg-dim': 'var(--sp-bg-dim)',
          'bg-m1': 'var(--sp-bg-m1)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          border: 'var(--sp-border)',
          'border-subtle': 'var(--sp-border-subtle)',
          fg: 'var(--sp-fg)',
          'fg-dim': 'var(--sp-fg-dim)',
          'fg-muted': 'var(--sp-fg-muted)',
          accent: 'var(--sp-accent)',
          'accent-hover': 'var(--sp-accent-hover)',
          'accent-subtle': 'var(--sp-accent-subtle)',
          success: 'var(--sp-success)',
          warning: 'var(--sp-warning)',
          error: 'var(--sp-error)',
          'error-subtle': 'var(--sp-error-subtle)',
        },
      },
```

**After**:
```typescript
      colors: {
        sp: {
          bg: 'var(--sp-bg)',
          'bg-dim': 'var(--sp-bg-dim)',
          'bg-m1': 'var(--sp-bg-m1)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          border: 'var(--sp-border)',
          'border-subtle': 'var(--sp-border-subtle)',
          fg: 'var(--sp-fg)',
          'fg-dim': 'var(--sp-fg-dim)',
          'fg-muted': 'var(--sp-fg-muted)',
          accent: 'var(--sp-accent)',
          'accent-hover': 'var(--sp-accent-hover)',
          'accent-subtle': 'var(--sp-accent-subtle)',
          success: 'var(--sp-success)',
          warning: 'var(--sp-warning)',
          error: 'var(--sp-error)',
          'error-subtle': 'var(--sp-error-subtle)',
        },
      },
      boxShadow: {
        'sp-sm': 'var(--sp-shadow-sm)',
        'sp-md': 'var(--sp-shadow-md)',
      },
      fontSize: {
        kpi: ['30px', { lineHeight: '36px', fontWeight: '700', letterSpacing: '-0.8px' }],
      },
```

**Verification**: `pnpm build` — Tailwind config compiles without errors.

---

### 1.2 Update layout max-width and page padding in `__root.tsx`

**File**: `packages/frontend/src/routes/__root.tsx`

Two changes in `<nav>` and `<main>`:
- `max-w-5xl` → `max-w-[1200px]`
- `px-4` → `px-8`

**Before** (line 10): `className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"`
**After** (line 10): `className="mx-auto flex max-w-[1200px] items-center justify-between px-8 py-3"`

**Before** (line 38): `className="mx-auto max-w-5xl px-4 py-8"`
**After** (line 38): `className="mx-auto max-w-[1200px] px-8 py-8"`

**Verification**: `pnpm build` — layout has 1200px max-width + 32px padding.

---

## Batch 2: Navbar

### 2.1 Change navbar background to `bg-sp-bg`

**File**: `packages/frontend/src/routes/__root.tsx`

**Before** (line 7): `<header className="border-b border-sp-border bg-sp-surface">`
**After** (line 7): `<header className="border-b border-sp-border bg-sp-bg">`

### 2.2 Add logo icon SVG to navbar

**File**: `packages/frontend/src/routes/__root.tsx`

Replace the text link with an inline SVG icon (32×32) + "ShortPulse" text.

**Before** (lines 12-14):
```tsx
          <Link to="/" className="text-lg font-semibold text-sp-accent hover:text-sp-accent-hover">
            ShortPulse
          </Link>
```

**After** (lines 12-16):
```tsx
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-semibold text-sp-accent hover:text-sp-accent-hover"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
              className="rounded-md"
            >
              <rect width="32" height="32" rx="6" fill="#658594" />
              <text
                x="16"
                y="22"
                textAnchor="middle"
                fill="#181616"
                fontSize="18"
                fontWeight="700"
                fontFamily="Inter, sans-serif"
              >
                S
              </text>
            </svg>
            ShortPulse
          </Link>
```

### 2.3 Replace active link underline with bg pill

**File**: `packages/frontend/src/routes/__root.tsx`

**Before** (line 19): `activeProps={{ className: 'text-sp-fg underline' }}`
**After** (line 29): `activeProps={{ className: 'bg-sp-surface text-sp-fg rounded-md px-3 py-1.5' }}`

**Before** (line 20): `className="hover:text-sp-fg"`
**After** (line 30): `className="px-3 py-1.5 rounded-md hover:text-sp-fg"`

Same pattern for the Analytics link (lines 27-29).

### 2.4 Set navbar height to 64px (`h-16`)

**File**: `packages/frontend/src/routes/__root.tsx`

In the `<nav>` element: replace `py-3` with `h-16`.

**Before** (line 10): `className="mx-auto flex max-w-[1200px] items-center justify-between px-8 py-3"`
**After** (line 10): `className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-8"`

### 2.5 Add StatusPill component and ThemeToggle wrapper

**File**: `packages/frontend/src/routes/__root.tsx`

Insert StatusPill (status indicator) between the nav links `<ul>` and the `<ThemeToggle />`, and wrap `<ThemeToggle />` with bg/border styling.

**Before** (lines 15-35):
```tsx
          <ul className="flex items-center gap-6 text-sm font-medium text-sp-fg-dim">
            <li>
              <Link
                to="/"
                activeProps={{ className: 'text-sp-fg underline' }}
                className="hover:text-sp-fg"
              >
                Links
              </Link>
            </li>
            <li>
              <Link
                to="/analytics"
                activeProps={{ className: 'text-sp-fg underline' }}
                className="hover:text-sp-fg"
              >
                Analytics
              </Link>
            </li>
          </ul>
          <ThemeToggle />
```

**After** (lines 25-54):
```tsx
          <ul className="flex items-center gap-1 text-sm font-medium text-sp-fg-dim">
            <li>
              <Link
                to="/"
                activeProps={{ className: 'bg-sp-surface text-sp-fg rounded-md px-3 py-1.5' }}
                className="px-3 py-1.5 rounded-md hover:text-sp-fg"
              >
                Links
              </Link>
            </li>
            <li>
              <Link
                to="/analytics"
                activeProps={{ className: 'bg-sp-surface text-sp-fg rounded-md px-3 py-1.5' }}
                className="px-3 py-1.5 rounded-md hover:text-sp-fg"
              >
                Analytics
              </Link>
            </li>
          </ul>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md bg-sp-bg-m1 px-3 py-1 text-sm font-medium text-sp-fg-dim">
              <span className="h-2 w-2 rounded-full bg-sp-success" aria-hidden="true" />
              Online
            </div>
            <span className="inline-flex rounded-md bg-sp-surface border border-sp-border">
              <ThemeToggle />
            </span>
          </div>
```

Also update `__root.tsx` imports: no new imports needed (StatusPill is inline).

### 2.6 Remove underline styling from ThemeToggle button classes

**File**: `packages/frontend/src/components/ui/theme-toggle.tsx`

Remove `hover:bg-sp-surface-hover` and `rounded-md` since the wrapper now provides bg/border context.

**Before** (line 37):
```tsx
      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-sp-fg-dim transition-colors hover:bg-sp-surface-hover hover:text-sp-fg focus-visible:ring-2 focus-visible:ring-sp-accent"
```

**After** (line 37):
```tsx
      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-sp-fg-dim transition-colors hover:text-sp-fg focus-visible:ring-2 focus-visible:ring-sp-accent"
```

**Verification**: `pnpm build` — navbar renders with pill active style, StatusPill, and wrapped ThemeToggle.

---

## Batch 3: Core Components

### 3.1 Button — primary text color, weight, radius

**File**: `packages/frontend/src/components/ui/button.tsx`

**Before** (line 10): `'bg-sp-accent text-white hover:bg-sp-accent-hover focus-visible:ring-sp-accent disabled:bg-sp-fg-muted'`
**After** (line 10): `'bg-sp-accent text-sp-bg hover:bg-sp-accent-hover focus-visible:ring-sp-accent disabled:bg-sp-fg-muted'`

Also update `BASE_CLASSES` to use `rounded-lg` instead of `rounded-md`:

**Before** (line 25): `'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +`
**After** (line 25): `'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +`

### 3.2 Input — height and border-radius

**File**: `packages/frontend/src/components/ui/input.tsx`

Add `h-11 rounded-lg` to the `<input>` className array.

**Before** (line 25): `'block w-full rounded-md border px-3 py-2 text-sm shadow-sm',`
**After** (line 25): `'block w-full rounded-lg border px-3 h-11 text-sm shadow-sm',`

### 3.3 Links table slug chips — text-sm, rounded-md

**File**: `packages/frontend/src/features/links/links-table.tsx`

**Before** (line 46):
```tsx
      <span className="inline-block rounded bg-sp-accent-subtle px-1.5 py-0.5 font-mono text-xs text-sp-accent-hover">
```

**After** (line 46):
```tsx
      <span className="inline-block rounded-md bg-sp-accent-subtle px-1.5 py-0.5 font-mono text-sm text-sp-accent-hover">
```

### 3.4 Events table slug chips — text-sm, rounded-md

**File**: `packages/frontend/src/features/analytics/events-table.tsx`

**Before** (line 53):
```tsx
              ? 'font-mono text-xs italic text-sp-fg-muted'
              : 'inline-block rounded bg-sp-accent-subtle px-1.5 py-0.5 font-mono text-xs text-sp-accent-hover'
```

**After** (line 53):
```tsx
              ? 'font-mono text-sm italic text-sp-fg-muted'
              : 'inline-block rounded-md bg-sp-accent-subtle px-1.5 py-0.5 font-mono text-sm text-sp-accent-hover'
```

**Verification**: `pnpm test` — button.test.tsx, input.test.tsx pass unchanged.

---

## Batch 4: Tables + Pagination

### 4.1 Links table — header typography (text-[11px], tracking-[0.8px])

**File**: `packages/frontend/src/features/links/links-table.tsx`

Change both `<th>` cells (sortable and non-sortable headers).

**Before** (line 213): `className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-sp-fg-muted"`
**After** (line 213): `className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.8px] text-sp-fg-muted"`

**Before** (line 233): `className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-sp-fg-muted"`
**After** (line 233): `className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.8px] text-sp-fg-muted"`

### 4.2 Links table — row padding (px-5 py-3.5)

**File**: `packages/frontend/src/features/links/links-table.tsx`

**Before** (line 246): `className="px-3 py-2 align-middle text-sp-fg">`
**After** (line 246): `className="px-5 py-3.5 align-middle text-sp-fg">`

**Before** (line 250): `className="px-3 py-2 align-middle">`
**After** (line 250): `className="px-5 py-3.5 align-middle">`

### 4.3 Links table — toolbar with count badge

**File**: `packages/frontend/src/features/links/links-table.tsx`

Add a toolbar above the table showing the total link count.

In the JSX block starting at line 190, wrap the `<SearchBox>` and add a toolbar row.

**Before** (lines 190-297):
```tsx
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={searchInput} onChange={handleSearchChange} />
      <div className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface">
        ...
      </div>
      <Pagination ... />
    </div>
  );
```

**After** (lines 190-306):
```tsx
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <SearchBox value={searchInput} onChange={handleSearchChange} />
        <span className="inline-flex items-center rounded-md bg-sp-bg-m1 px-3 py-1 text-sm font-medium text-sp-fg-dim">
          {query.data?.total ?? 0} enlaces
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface">
        ...
      </div>
      <Pagination ... />
    </div>
  );
```

### 4.4 Links table — pagination redesign

**File**: `packages/frontend/src/features/links/links-table.tsx`

Replace the entire `Pagination` component (lines 322-355).

**Before** (lines 322-355):
```tsx
function Pagination({
  page,
  totalPages,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}): React.JSX.Element {
  return (
    <nav
      aria-label="Paginación de enlaces"
      className="flex items-center justify-between text-sm text-sp-fg-muted"
    >
      <span>
        Página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onPrev} disabled={!canPrev}>
          Anterior
        </Button>
        <Button size="sm" variant="secondary" onClick={onNext} disabled={!canNext}>
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
```

**After** (lines 322-355):
```tsx
function Pagination({
  page,
  totalPages,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}): React.JSX.Element {
  return (
    <nav
      aria-label="Paginación de enlaces"
      className="flex items-center justify-center gap-3"
    >
      <Button size="sm" variant="secondary" onClick={onPrev} disabled={!canPrev}>
        ← Anterior
      </Button>
      <span className="rounded-md bg-sp-bg-m1 px-3 py-1 text-sm font-medium text-sp-fg">
        {page} de {totalPages}
      </span>
      <Button size="sm" variant="secondary" onClick={onNext} disabled={!canNext}>
        Siguiente →
      </Button>
    </nav>
  );
}
```

### 4.5 Events table — header typography (text-[11px], tracking-[0.8px])

**File**: `packages/frontend/src/features/analytics/events-table.tsx`

**Before** (line 234): `className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-sp-fg-muted"`
**After** (line 234): `className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.8px] text-sp-fg-muted"`

### 4.6 Events table — row padding (px-5 py-3.5)

**File**: `packages/frontend/src/features/analytics/events-table.tsx`

**Before** (line 246): `className="px-3 py-2 align-middle text-sp-fg">`
**After** (line 246): `className="px-5 py-3.5 align-middle text-sp-fg">`

### 4.7 Events table — toolbar with count badge and filter toggle

**File**: `packages/frontend/src/features/analytics/events-table.tsx`

Add a toolbar row above the table showing event count and a filter button.

**Before** (lines 213-263):
```tsx
  return (
    <div className="flex flex-col gap-4">
      <Filters ... />
      <div className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface">
        ...
      </div>
      <Pagination ... />
    </div>
  );
```

**After** (lines 213-272):
```tsx
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center rounded-md bg-sp-bg-m1 px-3 py-1 text-sm font-medium text-sp-fg-dim">
          {query.data?.total ?? 0} eventos
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-sp-fg-dim hover:text-sp-fg focus-visible:ring-2 focus-visible:ring-sp-accent"
          aria-label="Filtrar eventos"
          onClick={() => {
            /* toggle filter panel — existing Filters component is always visible, this button is a visual indicator */
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filtros
        </button>
      </div>
      <Filters ... />
      <div className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface">
        ...
      </div>
      <Pagination ... />
    </div>
  );
```

### 4.8 Events table — pagination redesign

**File**: `packages/frontend/src/features/analytics/events-table.tsx`

Replace the `Pagination` component (lines 325-357) identically to 4.4, but with `aria-label="Paginación de eventos"`.

**Before** (lines 325-357): Same pattern as links-table (justevents-specific aria-label).

**After**: Same pagination pattern as 4.4 with `aria-label="Paginación de eventos"`.

**Verification**: `pnpm test` — links-table and events-table tests pass; pagination test assertions check button presence (preserved).

---

## Batch 5: Page Headers + KPI + Timeseries

### 5.1 Links page header — "Tus enlaces" (28px) + subtitle

**File**: `packages/frontend/src/features/links/links-page.tsx`

**Before** (lines 21-28):
```tsx
  return (
    <section aria-labelledby="links-title" className="flex flex-col gap-6">
      <h1 id="links-title" className="text-2xl font-semibold text-sp-fg">
        Links
      </h1>
      <CreateLinkForm />
      <LinksTable />
    </section>
  );
```

**After** (lines 21-30):
```tsx
  return (
    <section aria-labelledby="links-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 id="links-title" className="text-[28px] font-bold tracking-tight text-sp-fg">
          Tus enlaces
        </h1>
        <p className="text-sm text-sp-fg-dim">Gestiona y comparte tus enlaces acortados</p>
      </div>
      <CreateLinkForm />
      <LinksTable />
    </section>
  );
```

### 5.2 Analytics page header — "Analíticas" (28px) + subtitle

**File**: `packages/frontend/src/features/analytics/analytics-page.tsx`

**Before** (lines 32-41):
```tsx
  return (
    <section aria-labelledby="analytics-title" className="flex flex-col gap-6">
      <h1 id="analytics-title" className="text-2xl font-semibold text-sp-fg">
        Analytics
      </h1>
      <KpiCards />
      <TimeseriesChart />
      <EventsTable />
    </section>
  );
```

**After** (lines 32-43):
```tsx
  return (
    <section aria-labelledby="analytics-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 id="analytics-title" className="text-[28px] font-bold tracking-tight text-sp-fg">
          Analíticas
        </h1>
        <p className="text-sm text-sp-fg-dim">Métricas y eventos de tus enlaces acortados</p>
      </div>
      <KpiCards />
      <TimeseriesChart />
      <EventsTable />
    </section>
  );
```

### 5.3 KPI cards — icons, label/value typography

**File**: `packages/frontend/src/features/analytics/kpi-cards.tsx`

Update label from uppercase (`text-xs font-medium uppercase tracking-wide text-sp-fg-muted`) to `text-sm font-medium text-sp-fg-dim`.

Update value from `text-2xl font-semibold` to `text-kpi`.

Add icon wrapper with 32×32 bg and 16×16 SVG for each card.

**Before** (lines 86-104):
```tsx
        {KPI_SPECS.map((spec) => {
          const value = summary[spec.key];
          return (
            <div
              key={spec.key}
              className="flex flex-col gap-1 rounded-lg border border-sp-border bg-sp-surface px-4 py-3 shadow-sm"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-sp-fg-muted">
                {spec.label}
              </dt>
              <dd
                className="text-2xl font-semibold tabular-nums text-sp-fg"
                title={spec.description}
              >
                {formatKpiValue(value)}
              </dd>
            </div>
          );
        })}
```

**After** (lines 86-112):
```tsx
        {KPI_SPECS.map((spec) => {
          const value = summary[spec.key];
          return (
            <div
              key={spec.key}
              className="flex flex-col gap-1 rounded-lg border border-sp-border bg-sp-surface px-4 py-3 shadow-sm"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-sp-accent-subtle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sp-accent" aria-hidden="true">
                  {KPI_ICONS[spec.key] ?? KPI_ICONS.total_links}
                </svg>
              </div>
              <dt className="text-sm font-medium text-sp-fg-dim">
                {spec.label}
              </dt>
              <dd
                className="text-kpi tabular-nums text-sp-fg"
                title={spec.description}
              >
                {formatKpiValue(value)}
              </dd>
            </div>
          );
        })}
```

Add a `KPI_ICONS` map after `KPI_SPECS`:
```typescript
const KPI_ICONS: Record<string, React.JSX.Element> = {
  total_links: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  total_clicks: (
    <>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </>
  ),
  clicks_today: (
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  ),
  clicks_last_7_days: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
};
```

### 5.4 Timeseries chart — replace `<select>` with segmented pill buttons

**File**: `packages/frontend/src/features/analytics/timeseries-chart.tsx`

**Before** import (line 1): `import { useState, type ChangeEvent } from 'react';`
**After** import (line 1): `import { useState } from 'react';` (no longer need ChangeEvent)

**Before** (lines 83-105):
```tsx
      <header className="flex items-center justify-between gap-3">
        <h2 id="timeseries-title" className="text-base font-semibold text-sp-fg">
          Clicks por {granularity === 'day' ? 'día' : granularity === 'week' ? 'semana' : 'mes'}
        </h2>
        <label className="flex items-center gap-2 text-sm text-sp-fg-dim">
          <span>Granularidad</span>
          <select
            aria-label="Granularidad"
            value={granularity}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setGranularity(e.target.value as TimeseriesGranularity)
            }
            className="h-9 rounded-md border border-sp-border bg-sp-bg px-2 text-sm text-sp-fg shadow-sm focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent-subtle"
          >
            {GRANULARITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </header>
```

**After** (lines 83-108):
```tsx
      <header className="flex items-center justify-between gap-3">
        <h2 id="timeseries-title" className="text-base font-semibold text-sp-fg">
          Clicks por {granularity === 'day' ? 'día' : granularity === 'week' ? 'semana' : 'mes'}
        </h2>
        <div
          className="flex rounded-md bg-sp-bg-m1 p-0.5"
          role="radiogroup"
          aria-label="Granularidad"
        >
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={granularity === opt.value}
              onClick={() => setGranularity(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                granularity === opt.value
                  ? 'bg-sp-surface text-sp-fg shadow-sm'
                  : 'text-sp-fg-dim hover:text-sp-fg'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>
```

### 5.5 Card border-radius: `rounded-xl` (12px)

This applies to cards/pages that use `rounded-lg` (8px default) — the design spec says cards should be `rounded-xl` (12px).

**Check and update files** — search for `rounded-lg` in card containers. The design says card border-radius = 12px (`rounded-xl`). Currently many cards use `rounded-lg` (8px). Update to `rounded-xl` where design specifies 12px:

- `kpi-cards.tsx` — card `<div>`: `rounded-lg` → `rounded-xl` (line 91)
- `timeseries-chart.tsx` — chart section: `rounded-lg` → `rounded-xl` (line 82)
- `links-table.tsx` — table wrapper: `rounded-lg` → `rounded-xl` (line 193)
- `events-table.tsx` — table wrapper: `rounded-lg` → `rounded-xl` (line 225)

Note: `rounded-xl` in Tailwind = 12px. The design specifies 12px for cards.

**Verification**: `pnpm test` — all tests pass. Visual diff via dev server.

---

## Test Updates

### T1. Links page test — heading text assertion

**File**: `packages/frontend/src/features/links/links-page.test.tsx`

**Before** (line 36): `expect(screen.getByRole('heading', { name: /^links$/i, level: 1 })).toBeInTheDocument();`
**After** (line 36): `expect(screen.getByRole('heading', { name: /^tus enlaces$/i, level: 1 })).toBeInTheDocument();`

### T2. Analytics page test — heading text assertion

**File**: `packages/frontend/src/features/analytics/analytics-page.test.tsx`

**Before** (line 47): `expect(screen.getByRole('heading', { name: /^analytics$/i, level: 1 })).toBeInTheDocument();`
**After** (line 47): `expect(screen.getByRole('heading', { name: /^analíticas$/i, level: 1 })).toBeInTheDocument();`

**Before** (line 65): `expect(screen.getByRole('region', { name: /^analytics$/i })).toBeInTheDocument();`
**After** (line 65): `expect(screen.getByRole('region', { name: /^analíticas$/i })).toBeInTheDocument();`

### T3. Timeseries chart test — segmented buttons

**File**: `packages/frontend/src/features/analytics/timeseries-chart.test.tsx`

The test file at lines 262-367 needs significant changes:

1. **Line 270**: `screen.getByRole('combobox', { name: /granularidad/i })` → `screen.getByRole('radiogroup', { name: /granularidad/i })`
2. **Line 272**: `within(selector as HTMLElement).getAllByRole('option')` → remove (segmented buttons don't have options)
3. **Lines 273**: Replace option value assertion with button count and values assertion
4. **Lines 282**: `(selector as HTMLSelectElement).value` → `within(selector).getByRole('radio', { checked: true })`
5. **Lines 285-307**: Replace `setNativeValue` pattern with `userEvent.click` on buttons
6. **Lines 309-319**: Remove `getByRole('combobox')` references, replace with radiogroup button assertions
7. **Lines 337-348**: Replace `setNativeValue` with button click pattern for week/month selection

**Verification**: `pnpm test` — all test suites pass. `pnpm build` — no TS errors.

---

## Workload Forecast

| Batch | Files | Changed Lines (approx) |
|-------|-------|----------------------|
| Batch 1: Foundation | 2 | 10 |
| Batch 2: Navbar | 2 | 45 |
| Batch 3: Core Components | 4 | 6 |
| Batch 4: Tables + Pagination | 2 | 40 |
| Batch 5: Page Headers + KPI + Timeseries | 4 | 65 |
| Test Updates | 3 | 25 |
| **Total** | **12 files** | **~191 lines** |

**Verdict**: Well under 400 lines. No split needed. Apply all 5 batches as a single PR.

## Verification Commands

```bash
# After each batch
pnpm build

# After all batches
pnpm test
pnpm build

# Visual verification (start dev server)
cd packages/frontend && pnpm dev
```
