# ShortPulse — Kanagawa Dragon Design System

> Paleta de colores y sistema de diseño basado en Kanagawa Dragon (dark) y Kanagawa Lotus (light). Fuente: [kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim).

---

## 1. Paleta de Colores

### Kanagawa Dragon (Dark Mode — default)

| Token | Hex | Uso |
|-------|-----|-----|
| `bg` | `#181616` | Background principal de página |
| `bg-dim` | `#12120f` | Background más oscuro |
| `bg-m1` | `#1D1C19` | Headers de tabla, pagination bg |
| `bg-surface` | `#282727` | Cards, inputs, navbar |
| `bg-surface-hover` | `#393836` | Hover states, borders, badge bg |
| `border` | `#393836` | Borradores de cards, inputs, tabla |
| `border-subtle` | `#282727` | Bordes sutiles |
| `fg` | `#c5c9c5` | Texto principal, headings |
| `fg-dim` | `#a6a69c` | Texto secundario, labels |
| `fg-muted` | `#737c73` | Texto muted, placeholders, timestamps |
| `accent` | `#658594` | Botones primarios, links, chips slug, logo |
| `accent-hover` | `#8BA4B0` | Hover de accent, slug chip text |
| `accent-subtle` | `#223249` | Chip slug bg, KPI icon bg |
| `success` | `#87a987` | Estado activo, trends positivos |
| `warning` | `#c4b28a` | Icono de tema (sol) |
| `error` | `#c4746e` | Eliminar, enlace inactivo, row inactive |
| `error-subtle` | `#43242B` | Slug chip bg (enlace eliminado) |

### Kanagawa Lotus (Light Mode)

| Token | Hex | Uso |
|-------|-----|-----|
| `light-bg` | `#e7dba0` | Background principal |
| `light-bg-surface` | `#dcd5ac` | Cards, surfaces |
| `light-border` | `#dcd7ba` | Borders |
| `light-fg` | `#545464` | Texto principal |
| `light-fg-dim` | `#716e61` | Texto secundario |
| `light-accent` | `#4d699b` | Links, botones |
| `light-success` | `#6f894e` | Estado activo |
| `light-error` | `#c84053` | Error states |

---

## 2. Tipografía

| Propiedad | Valor |
|-----------|-------|
| **Familia** | Inter |
| **Heading 1** | 28px / 700 / -0.6 tracking |
| **Heading 2** | 16px / 600 |
| **Body** | 14px / 400 |
| **Body Strong** | 14px / 500 |
| **Small** | 13px / 400 |
| **Small Strong** | 13px / 500 |
| **Caption** | 12px / 500 |
| **Overline** | 11px / 600 / 0.8 tracking (headers de tabla) |
| **KPI Value** | 30px / 700 / -0.8 tracking |
| **Mono** | Inter / 13px / 600 (slugs en chips) |

---

## 3. Componentes

### Navbar (64px height)
- **Bg**: `#181616`
- **Border bottom**: `#393836` (1px)
- **Logo icon bg**: `#658594` (32x32, corner-radius 8)
- **Logo icon path**: `#181616`
- **Logo text**: `#c5c9c5` (18px, 700)
- **NavLink active bg**: `#282727`
- **NavLink active text**: `#c5c9c5`
- **NavLink inactive text**: `#a6a69c`
- **ThemeToggle bg**: `#282727`, border `#393836`
- **ThemeToggle icon**: `#c4b28a`
- **ThemeToggle text**: `#a6a69c`
- **StatusPill bg**: `#1D1C19`
- **StatusDot**: `#87a987`
- **StatusText**: `#87a987`

### Cards
- **Bg**: `#282727`
- **Border**: `#393836` (1px)
- **Corner radius**: 12px
- **Shadow**: `0 1px 2px rgba(0,0,0,0.2)`, `0 4px 12px rgba(0,0,0,0.15)`

### Inputs
- **Bg**: `#181616`
- **Border**: `#393836` (1px)
- **Corner radius**: 8px
- **Height**: 44px
- **Placeholder text**: `#737c73`
- **Icon**: `#737c73`

### Buttons
- **Primary bg**: `#658594`
- **Primary text**: `#181616`
- **Primary font**: 14px / 600
- **Corner radius**: 8px
- **Height**: 44px

### Slug Chips
- **Bg**: `#223249`
- **Text**: `#8BA4B0` (13px, 600)
- **Corner radius**: 6px
- **Padding**: 5px 10px

### Table
- **Header row bg**: `#1D1C19`
- **Header text**: `#737c73` (11px, 600, 0.8 tracking)
- **Row border**: `#393836`
- **Row stroke sides**: bottom only
- **Pagination bg**: `#1D1C19`
- **Pagination border top**: `#393836`
- **Active page bg**: `#658594`
- **Active page text**: `#181616`
- **Inactive page bg**: `#393836`
- **Inactive page border**: `#393836`

### KPI Cards
- **Bg**: `#282727`
- **Border**: `#393836`
- **Label text**: `#a6a69c` (13px, 500)
- **Value text**: `#c5c9c5` (30px, 700)
- **Icon bg**: `#223249` (32x32, corner-radius 8)
- **Icon**: `#658594` (16x16)
- **Trend positive**: `#87a987`
- **Trend neutral**: `#737c73`

### Chart
- **Bar color**: `#658594` (con opacidad variable: 0.55 → 1.0)
- **Baseline**: `#393836`
- **Axis text**: `#737c73`
- **Axis text bold**: `#a6a69c`
- **Granularity toggle bg**: `#1D1C19`
- **Granularity active bg**: `#282727`
- **Granularity active text**: `#c5c9c5`
- **Granularity inactive text**: `#a6a69c`

### Status Badges
- **Active bg**: `#1D1C19`
- **Active dot**: `#87a987`
- **Active text**: `#87a987`
- **Inactive bg**: `#43242B`
- **Inactive dot**: `#c4746e`
- **Inactive text**: `#c4746e`

### Country Code Badges
- **Bg**: `#393836`
- **Text**: `#a6a69c` (11px, 700)
- **Corner radius**: 4px

### Actions (icon buttons)
- **Copy icon**: `#a6a69c`
- **Delete icon**: `#c4746e`
- **Size**: 15x15

---

## 4. Layout

- **Max width**: 1200px
- **Page padding**: 32px
- **Section gap**: 24px
- **Card padding**: 24px
- **Table row padding**: 14px 20px
- **Navbar padding**: 0 32px

---

## 5. CSS Custom Properties (Dark Mode)

```css
:root[data-theme="dark"] {
  --bg: #181616;
  --bg-dim: #12120f;
  --bg-m1: #1D1C19;
  --bg-surface: #282727;
  --bg-surface-hover: #393836;
  --border: #393836;
  --border-subtle: #282727;
  --fg: #c5c9c5;
  --fg-dim: #a6a69c;
  --fg-muted: #737c73;
  --accent: #658594;
  --accent-hover: #8BA4B0;
  --accent-subtle: #223249;
  --success: #87a987;
  --warning: #c4b28a;
  --error: #c4746e;
  --error-subtle: #43242B;
}
```

## 6. CSS Custom Properties (Light Mode — Lotus)

```css
:root[data-theme="light"] {
  --bg: #e7dba0;
  --bg-dim: #dcd5ac;
  --bg-m1: #e5ddb0;
  --bg-surface: #dcd5ac;
  --bg-surface-hover: #dcd7ba;
  --border: #dcd7ba;
  --border-subtle: #e5ddb0;
  --fg: #545464;
  --fg-dim: #716e61;
  --fg-muted: #8a8980;
  --accent: #4d699b;
  --accent-hover: #5d57a3;
  --accent-subtle: #c7d7e0;
  --success: #6f894e;
  --warning: #cc6d00;
  --error: #c84053;
  --error-subtle: #d9a594;
}
```
