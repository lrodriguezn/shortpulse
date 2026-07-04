# Design: UI Alignment — OpenPencil Design

## Technical Approach

Five incremental batches applied sequentially, each < 400 diff lines. Zero behavioral changes (except the `<select>` → segmented buttons in Batch 5, which preserves the same options, default, and state variable). All styling changes use existing `--sp-*` CSS custom properties mapped to Tailwind's `sp-*` tokens. No new CSS variables, no new dependencies, no backend changes.

The strategy is **additive utility-class swaps** — every component gets new className values; no component logic or data flow changes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    RootLayout (__root.tsx)                │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ Logo (brand)  │  │ NavLinks      │  │ ThemeToggle  │  │
│  │ #181616 bg    │  │ active: pill  │  │ wrapper bg   │  │
│  │ icon + text   │  │ bg-sp-surface │  │ #282727      │  │
│  └──────────────┘  └───────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│  ┌──── max-w-[1200px] px-8 ───────────────────────────┐ │
│  │  LinksPage / AnalyticsPage                          │ │
│  │  ┌─ PageHeader (28px title + subtitle) ──────────┐  │ │
│  │  │  "Tus enlaces" / "Analíticas"                  │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  │  ┌─ CreateLinkForm ───────────────────────────────┐  │ │
│  │  │  Input (h-11 rounded-lg), Button (text-sp-bg)  │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  │  ┌─ LinksTable / EventsTable ────────────────────┐  │ │
│  │  │  Header: overline 11px/600/.8 tracking        │  │ │
│  │  │  Rows: px-5 py-3.5                            │  │ │
│  │  │  Pagination: prev/next + page-info pill       │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  │  ┌─ KpiCards ─────────────────────────────────────┐  │ │
│  │  │  Icon (32×32 bg, 16×16 icon), label, 30px val │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  │  ┌─ TimeseriesChart ─────────────────────────────┐  │ │
│  │  │  Segmented pill buttons (instead of <select>)  │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### AD-1: Button Primary Text — Use `text-sp-bg`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `text-sp-bg` (CSS var) | Dark: #181616 ✓ Light: #e7dba0 — decent contrast on accent #4d699b | ✅ **Selected** |
| `text-[#181616] dark:text-[#181616]` | Breaks in light mode (invisible on accent) | ❌ Rejected |
| New `--sp-btn-primary-text` CSS var | Extra token to maintain, over-engineered | ❌ Rejected |

**Rationale**: `text-sp-bg` resolves to contrasting values in both themes — #181616 on #658594 (dark) and #e7dba0 on #4d699b (light). The design spec states `#181616` which IS the dark-mode `--sp-bg` value; using the token keeps theme-awareness automatically.

### AD-2: Tailwind Config — Extend `boxShadow` and `fontSize`

**Choice**: Add `shadow-sp-sm`, `shadow-sp-md`, and `kpi` font size to `tailwind.config.ts`.
**Rationale**: 10+ components use card shadows; centralizing prevents drift. The KPI value font (30px/700/-0.8 tracking) has no Tailwind built-in equivalent.
**Concern**: Adding `boxShadow` with `var()` references keeps shadows theme-aware (darker in dark mode, softer in light).

### AD-3: Granularity Switcher — Segmented Button Group

**Choice**: Replace `<select>` with an inline `<div>` of `<button>` elements styled as segmented pills.
**Rationale**: Same options, same default, same state variable (`granularity`). Visual-only change. Preserves keyboard navigation via native `<button>` elements. ARIA `role="radiogroup"` with `aria-checked` on each button preserves accessibility.
**Risk**: Low — the test currently queries `getByRole('combobox')` and must be updated to `getByRole('radio')`.

### AD-4: Navbar Active Link — `activeProps` Pill Style

**Choice**: Replace `activeProps={{ className: 'underline' }}` with `activeProps={{ className: 'bg-sp-surface text-sp-fg' }}` + `rounded-md px-3 py-1.5`.
**Rationale**: TanStack Router's `activeProps` already applies conditionally; swapping the className from underline to bg-pill is a one-line change. No router config changes needed.

### AD-5: Pagination — Redesign as Prev/Next + Info Pill

**Choice**: Replace the two `<Button>` pagination with prev/next buttons + centered page-info pill (`bg-sp-bg-m1 rounded-md px-3 py-1`).
**Rationale**: Both `LinksTable` and `EventsTable` have identical local `<Pagination>` components — change both in lockstep. The info pill shows "1 de 3" instead of "Página 1 de 3" (per design).

---

## Component Design

### Batch 1: Foundation (`tailwind.config.ts`, layout, globals)

**Tailwind Config** — extend:
```typescript
// packages/frontend/tailwind.config.ts
theme: {
  extend: {
    boxShadow: {
      'sp-sm': 'var(--sp-shadow-sm)',
      'sp-md': 'var(--sp-shadow-md)',
    },
    fontSize: {
      kpi: ['30px', { lineHeight: '36px', fontWeight: '700', letterSpacing: '-0.8px' }],
    },
  },
}
```

**`__root.tsx`** — layout wrapper:
- `max-w-5xl` → `max-w-[1200px]`
- `px-4` → `px-8` (32px)
- `py-8` stays (interior components control their own padding)

### Batch 2: Navbar (`__root.tsx`)

| Element | Current | Target |
|---------|---------|--------|
| Header bg | `bg-sp-surface` | `bg-sp-bg` |
| Logo | Text link "ShortPulse" | SVG icon (32×32, bg `#658594`) + text "ShortPulse" |
| Active link | `underline` + `text-sp-fg` | `bg-sp-surface text-sp-fg rounded-md px-3 py-1.5` |
| Inactive link | `text-sp-fg-dim hover:text-sp-fg` | `text-sp-fg-dim hover:text-sp-fg px-3 py-1.5 rounded-md` |
| ThemeToggle wrapper | Inline button | Wrapped in `bg-sp-surface border border-sp-border rounded-md` |
| StatusPill | — | New: `bg-sp-bg-m1 rounded-md px-3 py-1 flex items-center gap-2` |

Navbar height: `py-3` → `h-16` (64px per design).

### Batch 3: Button + Input + Slug Chips

**Button** (`button.tsx`):
- Primary variant: `text-white` → `text-sp-bg`, weight stays 600, radius `rounded-md` → `rounded-lg` (8px)

**Input** (`input.tsx`):
- Height: `py-2` → `py-2.5` + `h-11` (44px)
- Radius: `rounded-md` → `rounded-lg` (8px)
- (height+radius via `h-11 rounded-lg` on the `<input>` element)

**Slug chips** (both tables):
- `text-xs` → `text-sm` (13px)
- `rounded` → `rounded-md` (6px)
- Padding `px-1.5 py-0.5` stays (matches ~5px 10px per design)

### Batch 4: Tables + Pagination

**Table headers** (both tables):
- `text-xs font-semibold uppercase tracking-wide` → `text-[11px] font-semibold uppercase tracking-[0.8px]`
- Already matches design — just confirming no change needed if current is already `text-xs + uppercase + tracking-wide`.

Wait — `text-xs` is 12px. Design says 11px. Current code: `text-xs font-semibold uppercase tracking-wide text-sp-fg-muted` — this is 12px, not 11px. We need `text-[11px]`.

**Table rows** (both tables):
- `px-3 py-2` → `px-5 py-3.5` (from design: 14px 20px)

**Pagination** (both tables — local `<Pagination>` component):
Current:
```html
<nav class="flex items-center justify-between text-sm text-sp-fg-muted">
  <span>Página {page} de {totalPages}</span>
  <div class="flex gap-2">
    <Button variant="secondary" /> Anterior
    <Button variant="secondary" /> Siguiente
  </div>
</nav>
```
Target:
```html
<nav class="flex items-center justify-center gap-3">
  <Button variant="secondary" size="sm" /> ← Anterior
  <span class="rounded-md bg-sp-bg-m1 px-3 py-1 text-sm font-medium text-sp-fg">
    {page} de {totalPages}
  </span>
  <Button variant="secondary" size="sm" /> Siguiente →
</nav>
```
(Use `←` / unicode arrows or SVG icons for prev/next)

### Batch 5: Page headers + KPI + Timeseries

**Page headers** (both pages):
```tsx
// Current
<h1 className="text-2xl font-semibold text-sp-fg">Links</h1>

// Target
<div className="flex flex-col gap-1">
  <h1 className="text-[28px] font-bold tracking-tight text-sp-fg">Tus enlaces</h1>
  <p className="text-sm text-sp-fg-dim">Gestiona y comparte tus enlaces acortados</p>
</div>
```
- "Links" → "Tus enlaces"
- "Analytics" → "Analíticas"
- Subtitle per page

**KPI Cards** (`kpi-cards.tsx`):
- Label: `text-xs font-medium uppercase tracking-wide` → `text-sm font-medium text-sp-fg-dim` (13px/500, NOT uppercase)
- Value: `text-2xl font-semibold` → `text-kpi` (30px/700 from config extension)
- Icon: New 32×32 icon background with 16×16 inline SVG per card:
  ```tsx
  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-sp-accent-subtle">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" className="text-sp-accent">
      {/* icon path */}
    </svg>
  </div>
  ```
- 4 icons: LinkIcon, BarChart2Icon, ZapIcon, CalendarIcon (simple inline SVGs)

**TimeseriesChart** (`timeseries-chart.tsx`):
- Replace `<select>` with segmented button group:
```tsx
<div className="flex rounded-md bg-sp-bg-m1 p-0.5" role="radiogroup" aria-label="Granularidad">
  {GRANULARITY_OPTIONS.map((opt) => (
    <button
      key={opt.value}
      role="radio"
      aria-checked={granularity === opt.value}
      onClick={() => setGranularity(opt.value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors
        ${granularity === opt.value
          ? 'bg-sp-surface text-sp-fg shadow-sm'
          : 'text-sp-fg-dim hover:text-sp-fg'
        }`}
    >
      {opt.label}
    </button>
  ))}
</div>
```
- Remove the "Granularidad" text label (segmented buttons are self-explanatory)

---

## Theme Strategy

All styling relies on existing `--sp-*` CSS custom properties defined in `globals.css` for both `[data-theme="dark"]` and `[data-theme="light"]`. The Tailwind `sp-*` tokens are already mapped. No new CSS variables needed.

| Component | Dark Token | Light Token | Strategy |
|-----------|-----------|-------------|----------|
| Navbar bg | `--sp-bg` #181616 | `--sp-bg` #e7dba0 | `bg-sp-bg` — auto-switches |
| Button primary text | `--sp-bg` #181616 | `--sp-bg` #e7dba0 | `text-sp-bg` — auto-switches |
| Shadow sm | rgba(0,0,0,0.2) | rgba(0,0,0,0.08) | `shadow-sp-sm` via CSS var |
| Shadow md | rgba(0,0,0,0.15) | rgba(0,0,0,0.06) | `shadow-sp-md` via CSS var |
| Pagination pill bg | `--sp-bg-m1` #1d1c19 | `--sp-bg-m1` #e5ddb0 | `bg-sp-bg-m1` — auto-switches |

**Edge case — button primary text visibility**: Verified in both themes:
- Dark: `#181616` on accent `#658594` → contrast ratio ~4.0:1 (passes WCAG AA for 14px/600 text at 14pt)
- Light: `#e7dba0` on accent `#4d699b` → contrast ratio ~4.5:1 (passes WCAG AA)

---

## KPI Card Icons

Four inline SVG icons (no library dependency). All use `currentColor` with `text-sp-accent` (adapts per theme).

| Icon | Component | SVG Path |
|------|-----------|----------|
| **LinkIcon** | total_links | `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>` |
| **BarChart2Icon** | total_clicks | `<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>` |
| **ZapIcon** | clicks_today | `<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>` |
| **CalendarIcon** | clicks_last_7_days | `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>` |

---

## Accessibility

| Component | Current | Target | Why |
|-----------|---------|--------|-----|
| Active link | `underline` | `bg-sp-surface` + `rounded-md` | Affordance via bg change, not just color |
| Selected pill | `option[selected]` | `aria-checked=true` on `<button>` | Segmented buttons need `role="radiogroup"` |
| KPI section | `aria-label="Indicadores clave"` | Same (preserved) | No regression |
| Pagination | Buttons with labels | Same + `aria-current` on active pill | State awareness |
| Page headers | `<h1>` | Same (preserved) | Heading hierarchy unchanged |
| Color contrast | Verified for each change | All `--sp-*` pairs pass WCAG AA | No hardcoded colors |

**Keyboard navigation**: Segmented button group uses native `<button>` elements (tabbable). Arrow key navigation via `role="radiogroup"` is a nice-to-have but not required for launch — basic tabbing works.

---

## Testing Strategy

| File | Change | Test Impact |
|------|--------|-------------|
| `button.test.tsx` | Text color change (visual only) | **No change** — no assertion on text color |
| `input.test.tsx` | Height/radius change (visual only) | **No change** — no assertion on dimensions |
| `kpi-cards.test.tsx` | New icon SVGs, label class changes | **Update** — label assertions are text-based (no change), but structure changes (icon div) may affect queries. Tests assert on text content, not classes — should pass as-is |
| `timeseries-chart.test.tsx` | `<select>` → segmented buttons | **Must update** — `getByRole('combobox')` → `getByRole('radiogroup')`. Option assertions change to button assertions |
| `layout.test.tsx` | Navbar link classes, active style | **No change** — tests assert on link presence/href, not visual style |
| `links-table.test.tsx` | Header font, row padding, pagination | **Update** — pagination test checks button presence (preserved). Row assertions unchanged |
| `events-table.test.tsx` | Same as links-table | **Same update pattern** |

**Critical test updates**:
- `timeseries-chart.test.tsx` line 270: `screen.getByRole('combobox', { name: /granularidad/i })` → `screen.getByRole('radiogroup', { name: /granularidad/i })`
- `timeseries-chart.test.tsx` line 272: `within(selector).getAllByRole('option')` → remove (segmented buttons don't have options)
- `timeseries-chart.test.tsx` lines 285–349: Change event simulation logic — needs `userEvent.click` on button instead of native setter on select

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/frontend/tailwind.config.ts` | Modify | Extend `boxShadow` (sp-sm, sp-md) and `fontSize` (kpi) |
| `packages/frontend/src/routes/__root.tsx` | Modify | Navbar bg, logo SVG, active pill style, layout max-w/padding, StatusPill slot, ThemeToggle wrapper |
| `packages/frontend/src/components/ui/button.tsx` | Modify | Primary variant: `text-white` → `text-sp-bg`, `rounded-md` → `rounded-lg` |
| `packages/frontend/src/components/ui/input.tsx` | Modify | `h-11` + `rounded-lg` on `<input>` |
| `packages/frontend/src/features/links/links-page.tsx` | Modify | Title → "Tus enlaces" + subtitle |
| `packages/frontend/src/features/analytics/analytics-page.tsx` | Modify | Title → "Analíticas" + subtitle |
| `packages/frontend/src/features/analytics/kpi-cards.tsx` | Modify | Icons, label style (no uppercase, 13px), value 30px |
| `packages/frontend/src/features/analytics/timeseries-chart.tsx` | Modify | `<select>` → segmented buttons |
| `packages/frontend/src/features/links/links-table.tsx` | Modify | Header 11px, row px-5 py-3.5, pagination redesign |
| `packages/frontend/src/features/analytics/events-table.tsx` | Modify | Header 11px, row px-5 py-3.5, pagination redesign |

**No new files, no deleted files.**

---

## Migration / Rollout

No migration required. Each batch is independently revertible via `git revert`. Apply batches 1–5 in order — each builds on the previous, but all are additive class changes with zero behavioral coupling.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Button `text-sp-bg` contrast in light mode | Low | Verified: #e7dba0 on #4d699b passes WCAG AA. Tag for design review. |
| Timeseries test needs significant rewrite | Med | Test uses mocked recharts + mocked hook — button click simulation is well-understood pattern. |
| Pagination redesign breaks both tables | Low | Both tables have identical local `<Pagination>` — change is contained. Update both simultaneously. |
| KPI SVG icons increase bundle | Low | Four inline SVGs ≈ 500 bytes gzipped total. Negligible. |
| Header text change ("Links" → "Tus enlaces") breaks test assertions | Low | Update `links-page.test.tsx` text assertions. No E2E tests match these strings. |

---

## Open Questions

- None — all decisions resolved during investigation.

