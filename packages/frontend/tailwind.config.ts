/**
 * TailwindCSS configuration — minimalist neutral palette per the
 * ShortPulse design language (spec links spec.md + design.md §7).
 *
 * - `content` restricts Tailwind to the package's own `src/**` so
 *   the build doesn't scan the whole monorepo.
 * - `theme` adds the `neutral` palette (we use the whole neutral scale
 *   for backgrounds, borders, and text). Tailwind ships `neutral` by
 *   default; we keep the explicit extension so future palette
 *   extensions (e.g. `brand`) are colocated.
 * - No plugins in WU1: the design system is intentionally minimal —
 *   presentation primitives in `components/ui/` use utility classes
 *   only. We can add `@tailwindcss/forms` and `@tailwindcss/typography`
 *   later if needed.
 */
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
