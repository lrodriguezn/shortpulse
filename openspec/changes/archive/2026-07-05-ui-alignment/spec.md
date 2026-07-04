# Visual Alignment Specification

**Purpose**: Presentational spec for ShortPulse frontend — layout, typography, color, spacing, shadows, radii matching OpenPencil design. Zero behavioral changes.

## Requirements

### R1: Layout

Wrapper: `max-width: 1200px`, `padding: 32px` (`px-8`), centered when viewport exceeds 1200px.

| Scenario | Steps |
|----------|-------|
| Visual | App renders → wrapper `max-width` is 1200px, padding 32px |
| Theme | Any theme → dimensions identical |
| Responsive | Viewport ≤ 1200px → content fills full width minus 32px padding |

### R2: Navbar

`bg-sp-bg`, logo SVG (32×32 icon bg `#658594` + "ShortPulse"), active link as pill (`bg-sp-surface rounded-md px-3 py-1.5`), inactive `px-3 py-1.5`, StatusPill (`bg-sp-bg-m1 rounded-md px-3 py-1`), ThemeToggle wrapper (`bg-sp-surface border border-sp-border rounded-md`), height `h-16`.

| Scenario | Steps |
|----------|-------|
| Visual | Navbar renders → `bg-sp-bg`, logo present, active pill, ThemeToggle wrapped |
| Theme | Light mode → `--sp-bg` resolves to light value, all tokens adapt |
| Responsive | Viewport 1200px → navbar spans full width |

### R3: Cards

`rounded-lg` (12px), shadows via `--sp-shadow-sm`/`--sp-shadow-md`.

| Scenario | Steps |
|----------|-------|
| Visual | Card renders → `border-radius` 12px, shadow uses sp-sm/sp-md token |
| Theme | Light mode → shadow opacity adapts via CSS var |
| Responsive | Viewport ≤ 1200px → radius and shadow unchanged |

### R4: Buttons

Primary: `text-sp-bg` (not `text-white`), weight 600, `rounded-lg` (8px), `h-11` (44px).

| Scenario | Steps |
|----------|-------|
| Visual | Primary button renders → `text-sp-bg`, weight 600, radius 8px, height 44px |
| Theme | Light mode on accent → `text-sp-bg` resolves to contrasting value (WCAG AA) |
| Responsive | Viewport ≤ 1200px → dimensions unchanged |

### R5: Inputs

`rounded-lg` (8px), `h-11` (44px).

| Scenario | Steps |
|----------|-------|
| Visual | Input renders → `border-radius` 8px, `height` 44px |
| Theme | Any theme → dimensions identical |
| Responsive | Viewport ≤ 1200px → dimensions unchanged |

### R6: Page Headers

Title: `28px`/700/`tracking-tight`. Subtitle: `14px`/400/`text-sp-fg-dim`. LinksPage title: "Tus enlaces". AnalyticsPage title: "Analíticas".

| Scenario | Steps |
|----------|-------|
| Visual | Page renders → title 28px/700, subtitle 14px/400 muted |
| Theme | Dark or light → title `text-sp-fg`, subtitle `text-sp-fg-dim` |
| Responsive | Viewport ≤ 1200px → font sizes unchanged |

### R7: KPI Cards

Icon wrapper: 32×32 `bg-sp-accent-subtle` + 16×16 SVG `text-sp-accent`. Label: `13px`/500 (NOT uppercase). Value: `30px`/700/`-0.8px` tracking (`text-kpi`).

| Scenario | Steps |
|----------|-------|
| Visual | KPI cards render → icon 32×32 bg + 16×16 SVG, label 13px/500, value 30px/700 |
| Theme | Light mode → `text-sp-accent` and `bg-sp-accent-subtle` adapt |
| Responsive | Viewport ≤ 1200px → grid layout holds |

### R8: Tables

Headers: `11px`/600/`letter-spacing: 0.8px`/uppercase. Rows: `padding: 14px 20px` (`px-5 py-3.5`). Pagination: prev/next buttons + centered pill (`bg-sp-bg-m1 rounded-md px-3 py-1 text-sm font-medium text-sp-fg`) with "X de Y".

| Scenario | Steps |
|----------|-------|
| Visual | Table renders → header 11px/600/0.8, rows px-5 py-3.5, pagination centered pill |
| Theme | Light mode → pagination `bg-sp-bg-m1` adapts via CSS var |
| Responsive | Viewport ≤ 1200px → horizontal scroll accommodates full width |

### R9: Timeseries Granularity

Segmented `<button>` elements in `role="radiogroup"`. Active: `bg-sp-surface text-sp-fg shadow-sm`. Inactive: `text-sp-fg-dim` on `bg-sp-bg-m1`.

| Scenario | Steps |
|----------|-------|
| Visual | TimeseriesChart renders → granularity controls are segmented buttons (not `<select>`) |
| Theme | Light mode → token colors adapt via CSS vars |
| Responsive | Viewport ≤ 1200px → buttons fit inline without wrapping |

### R10: Slug Chips

`font-size: 13px` (`text-sm`), `border-radius: 6px` (`rounded-md`).

| Scenario | Steps |
|----------|-------|
| Visual | Table with slug chips renders → font-size 13px, radius 6px |
| Theme | Any theme → dimensions identical |
| Responsive | Viewport ≤ 1200px → chips stay on one line |
