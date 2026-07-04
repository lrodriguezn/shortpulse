# Proposal: UI Alignment — OpenPencil Design

## Intent

The ShortPulse frontend was built with functional correctness in mind but its visual layer drifted from the OpenPencil design spec. 30 deltas were identified — bg colors, corner radii, spacing, shadows, typography, and layout — that make the app feel unpolished. This change closes those gaps with zero new features or backend changes.

## Scope

### In Scope
- Navbar: bg `#181616`, logo icon, active-link pill style, StatusPill, ThemeToggle wrapper
- Cards & forms: `border-radius` 12px, shadow tokens `--sp-shadow-sm/md`
- KPI cards: 32×32 icon bg with 16×16 icon, label style (not uppercase), value 30px
- Button: primary text `text-sp-bg` (not white), weight 600, radius 8px
- Page headers: "Tus enlaces" / "Analíticas" at 28px with subtitle
- Layout: max-width 1200px, page padding 32px
- Inputs: radius 8px, height 44px
- Tables: header 11px/0.8 tracking, row padding 14×20, pagination redesign
- TimeseriesChart: `<select>` → segmented pill buttons (same options)
- Slug chips: font-size 13px, radius 6px

### Out of Scope
- Backend or shared package changes
- Logic changes (no new queries, mutations, or state)
- New features or pages
- Light-mode color tuning (follows existing `--sp-*` tokens in light theme)
- E2E tests (visual changes only; unit tests updated where selectors change)

## Capabilities

### New Capabilities
None — pure presentational refactor, no new spec-level behavior.

### Modified Capabilities
None — existing specs (links, analytics, health) are unchanged.

## Approach

Five incremental batches to keep review under 400 lines each:

1. **Foundation** — Tailwind config extensions (no new theme tokens needed — existing `--sp-*` vars suffice), layout max-width to 1200px, page padding to 32px, global card radius to 12px via `rounded-lg`.
2. **Navbar** — bg color, logo SVG, pill active style, StatusPill, ThemeToggle wrapper + spacing.
3. **Button + Input + Slug chips** — button primary text color, weight, radius; input height + radius; slug chip font + radius.
4. **Tables + Pagination** — header typography, row padding, pagination redesigned as prev/next + page info pill.
5. **Page headers + KPI + Timeseries** — titles/subtitles, KPI card icons + label/value styles, granularity switcher from select to segmented buttons.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/frontend/src/styles/globals.css` | Modified | No changes needed (tokens already correct) |
| `packages/frontend/src/routes/__root.tsx` | Modified | Navbar bg, logo, layout wrapper, StatusPill slot |
| `packages/frontend/src/features/links/links-page.tsx` | Modified | Header title + subtitle |
| `packages/frontend/src/features/analytics/analytics-page.tsx` | Modified | Header title + subtitle |
| `packages/frontend/src/components/ui/button.tsx` | Modified | Primary text color, weight, radius |
| `packages/frontend/src/components/ui/input.tsx` | Modified | Height, border-radius |
| `packages/frontend/src/features/analytics/kpi-cards.tsx` | Modified | Icons, label/value styles |
| `packages/frontend/src/features/analytics/timeseries-chart.tsx` | Modified | Select → segmented buttons |
| `packages/frontend/src/features/links/links-table.tsx` | Modified | Header typo, row padding, pagination |
| `packages/frontend/src/features/analytics/events-table.tsx` | Modified | Header typo, row padding, pagination |
| `packages/frontend/src/components/ui/theme-toggle.tsx` | Modified | Wrapper styling for navbar placement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Button `text-sp-bg` (#181616) invisible on light bg in light mode | Low | Light mode `--sp-bg` is `#e7dba0` — still high contrast with accent bg. Verify in design review. |
| Granularity switcher select→segmented changes user interaction pattern | Low | Same options, same default, same behavior. Only visual. |
| Page header text content changes affect E2E selectors | Med | No E2E tests match these strings. Update any test assertions that check title text. |
| Pagination redesign breaks existing usage | Low | Both tables use local inline `Pagination` — change is contained. |

## Rollback Plan

Revert each batch independently via `git revert`. The batches are additive and non-overlapping, so selective rollback is safe. Worst case: `git revert HEAD~5` rolls back all 5 batches cleanly.

## Dependencies

- None. All `--sp-*` CSS custom properties already defined in `globals.css`.
- Tailwind `sp-*` theme extension already mapped in `tailwind.config.ts`.

## Success Criteria

- [ ] Visual diff matches the OpenPencil design reference for every component
- [ ] All existing unit tests pass (`pnpm test`)
- [ ] All existing E2E tests pass (`pnpm test:e2e`)
- [ ] Build succeeds with no TypeScript errors (`pnpm build`)
- [ ] Primary button text reads as `#181616` in dark mode, readable in light mode
