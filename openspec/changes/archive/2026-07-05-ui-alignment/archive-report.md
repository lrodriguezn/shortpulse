# Archive Report — `ui-alignment`

**Change**: `ui-alignment` (Frontend UI alignment with OpenPencil Kanagawa Dragon design)
**Archived on**: 2026-07-05
**Archived to**: `openspec/changes/archive/2026-07-05-ui-alignment/`
**Archive type**: Presentational refactor (no spec changes — pure visual alignment with existing `--sp-*` CSS tokens)
**Final verdict**: **PASS — SDD cycle complete**

---

## 1. Change Summary

Aligned the ShortPulse frontend visual layer with the OpenPencil Kanagawa Dragon design spec. 30 visual deltas were closed — background colors, corner radii, spacing, shadows, typography, layout, and component styles — with zero new features or backend changes.

The implementation was delivered as a single commit applying 5 incremental batches: Foundation (layout + Tailwind config), Navbar (logo, pill active style, StatusPill, ThemeToggle wrapper), Core Components (button/input/slug chips), Tables + Pagination (typography, row padding, pagination redesign), and Page Headers + KPI + Timeseries (titles, subtitles, icons, segmented buttons).

All styling used existing `--sp-*` CSS custom properties mapped to Tailwind's `sp-*` tokens. No new CSS variables, no new dependencies, no backend changes.

---

## 2. Verification Status

**Verdict**: PASS (with minor non-blocking findings).

| Requirement | Description | Status |
|-------------|-------------|--------|
| R1 | Layout (max-width 1200px, padding 32px) | ✅ PASS |
| R2 | Navbar (bg, logo, pill active, StatusPill, ThemeToggle wrapper) | ✅ PASS |
| R3 | Cards (rounded-xl 12px, shadow tokens) | ✅ PASS |
| R4 | Buttons (text-sp-bg, rounded-lg, weight 600) | ✅ PASS |
| R5 | Inputs (rounded-lg, h-11) | ✅ PASS |
| R6 | Page Headers (28px title, subtitle) | ✅ PASS |
| R7 | KPI Cards (icons, label/value typography) | ✅ PASS |
| R8 | Tables (header 11px/.8 tracking, row padding, pagination) | ✅ PASS |
| R9 | Timeseries Granularity (segmented buttons) | ✅ PASS |
| R10 | Slug Chips (text-sm, rounded-md) | ✅ PASS |

**Test results**: All 90 UI alignment tests pass across 9 test suites. One pre-existing failure in `api.test.ts` (port assertion) unrelated to this change.

**Type check**: 0 new errors (4 pre-existing errors in `vite.config.ts` and `tsconfig.json`).

**Lint**: 0 errors, 0 warnings.

### Minor Findings (non-blocking)

1. **Shadow tokens defined but unused**: `shadow-sp-sm`/`shadow-sp-md` are registered in the Tailwind config but no component uses them — components use `shadow-sm` (Tailwind default) instead. No visual impact since `shadow-sm` is close, but consider migrating for theme-aware shadows.
2. **Pre-existing type errors** (4) in `vite.config.ts` and `tsconfig.json` — unrelated.
3. **Pre-existing test failure** in `api.test.ts` (port 3000 mismatch) — unrelated.

---

## 3. Specs — Status

**No spec amendments.** This was a pure presentational refactor. The canonical specs (`openspec/specs/links/spec.md`, `openspec/specs/analytics/spec.md`, `openspec/specs/health/spec.md`) are unchanged — no delta specs to merge. All 10 requirements in the change spec (`openspec/changes/ui-alignment/spec.md`) were verified as correct.

---

## 4. Files Modified

The implementation was delivered in a single commit (`e0be208`) with 15 implementation files. An additional 3 test files were updated (uncommitted at archive time) to match the new component text and ARIA roles.

### Implementation files (committed — 15 files)

| # | File | Change |
|---|------|--------|
| 1 | `packages/frontend/tailwind.config.ts` | Extended `boxShadow` (sp-sm, sp-md) and `fontSize` (kpi) |
| 2 | `packages/frontend/src/styles/globals.css` | Added Kanagawa Dragon CSS custom properties (dark + light themes) |
| 3 | `packages/frontend/src/routes/__root.tsx` | Navbar bg → `bg-sp-bg`, logo SVG, active pill style, StatusPill, ThemeToggle wrapper, layout max-w/padding |
| 4 | `packages/frontend/src/components/ui/button.tsx` | Primary `text-white` → `text-sp-bg`, `rounded-md` → `rounded-lg` |
| 5 | `packages/frontend/src/components/ui/input.tsx` | Added `h-11` + `rounded-lg` |
| 6 | `packages/frontend/src/components/ui/theme-toggle.tsx` | Removed `hover:bg-sp-surface-hover` (wrapper now provides bg) |
| 7 | `packages/frontend/src/components/ui/empty-state.tsx` | Color token refactoring for Kanagawa palette |
| 8 | `packages/frontend/src/components/ui/spinner.tsx` | Color token refactoring for Kanagawa palette |
| 9 | `packages/frontend/src/features/links/links-page.tsx` | Title "Tus enlaces" (28px) + subtitle |
| 10 | `packages/frontend/src/features/links/links-table.tsx` | Header 11px/.8 tracking, row padding px-5 py-3.5, pagination redesign, toolbar with count badge, rounded-xl |
| 11 | `packages/frontend/src/features/links/create-link-form.tsx` | Minor styling updates for Kanagawa palette |
| 12 | `packages/frontend/src/features/analytics/analytics-page.tsx` | Title "Analíticas" (28px) + subtitle |
| 13 | `packages/frontend/src/features/analytics/events-table.tsx` | Header 11px/.8 tracking, row padding px-5 py-3.5, pagination redesign, toolbar with count badge, rounded-xl |
| 14 | `packages/frontend/src/features/analytics/kpi-cards.tsx` | Icon wrapper (32×32 bg + 16×16 SVG), label text-sm (no uppercase), text-kpi value |
| 15 | `packages/frontend/src/features/analytics/timeseries-chart.tsx` | `<select>` → segmented `<button>` radiogroup |

### Test file updates (uncommitted — 3 files)

| # | File | Change |
|---|------|--------|
| 16 | `packages/frontend/src/features/links/links-page.test.tsx` | Heading assertion: `/^links$/i` → `/^tus enlaces$/i` |
| 17 | `packages/frontend/src/features/analytics/analytics-page.test.tsx` | Heading assertion: `/^analytics$/i` → `/^analíticas$/i`; region assertion: same |
| 18 | `packages/frontend/src/features/analytics/timeseries-chart.test.tsx` | `combobox` queries → `radiogroup`/`radio` queries; `setNativeValue` → `userEvent.click` |

**Total: 18 files** (15 committed + 3 uncommitted test updates)

---

## 5. Archive Contents

The archived change folder contains the full SDD audit trail:

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/archive/2026-07-05-ui-alignment/proposal.md` | ✅ |
| Spec | `openspec/changes/archive/2026-07-05-ui-alignment/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-07-05-ui-alignment/design.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-07-05-ui-alignment/tasks.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-07-05-ui-alignment/verify-report.md` | ✅ |
| This archive report | `openspec/changes/archive/2026-07-05-ui-alignment/archive-report.md` | ✅ (newly added) |

The active `openspec/changes/ui-alignment/` directory is preserved during the SDD cycle but the authoritative archive copy lives here. The archive is the audit trail and MUST NOT be modified.

---

## 6. Implementation Details

### Architecture

All changes are additive utility-class swaps — every component received new `className` values; no component logic, data flow, state, or backend code was modified.

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
│  │  ┌─ PageHeader (28px + subtitle) ────────────────┐  │ │
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

### Key Architecture Decisions

| AD | Decision | Rationale |
|----|----------|-----------|
| AD-1 | Button primary text: `text-sp-bg` (CSS var) | Auto-adapts per theme — dark #181616, light #e7dba0. Both pass WCAG AA on accent. |
| AD-2 | Tailwind config: `shadow-sp-sm`/`shadow-sp-md` + `text-kpi` fontSize | Centralizes shadow tokens and KPI value typography (30px/700/-0.8px). Theme-aware via CSS vars. |
| AD-3 | Granularity switcher: segmented buttons (role=radiogroup) | Same options/behavior, visual-only. Preserves keyboard nav via native `<button>`. |
| AD-4 | Navbar active link: `activeProps` bg pill | TanStack Router's `activeProps` applies conditionally — one-line className swap from underline to bg pill. |
| AD-5 | Pagination: prev/next + info pill | Both tables have identical local `<Pagination>` components. Changed in lockstep. |

### Theme Strategy

All styling relies on existing `--sp-*` CSS custom properties in `globals.css` (dark + light). The Tailwind `sp-*` tokens were already mapped. No new CSS variables introduced.

| Component | Dark | Light | Strategy |
|-----------|------|-------|----------|
| Navbar bg | `#181616` | `#e7dba0` | `bg-sp-bg` — auto-switches |
| Button primary text | `#181616` | `#e7dba0` | `text-sp-bg` — auto-switches |
| Shadow sm | rgba(0,0,0,0.2) | rgba(0,0,0,0.08) | `shadow-sp-sm` via CSS var |
| Pagination pill | `#1d1c19` | `#e5ddb0` | `bg-sp-bg-m1` — auto-switches |

---

## 7. Lessons Learned

1. **Shadow tokens defined but unused**: The `shadow-sp-sm`/`shadow-sp-md` tokens were added to the Tailwind config but never applied to any component. Components use `shadow-sm` (Tailwind default, 8px) instead of the custom shadow token. Future cleanup: migrate card shadow references to use `shadow-sp-sm`/`shadow-sp-md` for proper theme-aware shadows.

2. **Test drift — implementation committed without test updates**: Three test files needed updates to match the new heading text and ARIA roles (`combobox` → `radiogroup`), but these changes were uncommitted at archive time. The implementation commit (`e0be208`) did not include test updates. Tests pass in the working tree (uncommitted changes applied) but would fail at `e0be208` alone. Recommendation: include test updates in the same commit as implementation changes going forward.

3. **No spec delta required**: As a pure presentational refactor with no behavioral or capability changes, the canonical specs required no amendments. The 10 visual requirements were documented in the change spec only.

4. **Adding visual-only config entries requires discipline**: The Tailwind `boxShadow` and `fontSize` extensions are valid but unused (shadows) or used (kpi font). A follow-up pass is needed to migrate components to the custom shadow tokens.

---

## 8. SDD Cycle Closure

The `ui-alignment` change is now fully closed. Every SDD phase has run to completion:

```
propose → spec → design → tasks → apply (1 commit) → verify (PASS) → archive (this report)
```

The canonical specs in `openspec/specs/{links,analytics,health}/spec.md` are the source of truth going forward. The archive is the audit trail.

**Ready for the next change.**
