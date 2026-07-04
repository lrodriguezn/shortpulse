import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        sp: {
          bg: 'var(--sp-bg)',
          'bg-dim': 'var(--sp-bg-dim)',
          'bg-m1': 'var(--sp-bg-m1)',
          surface: 'var(--sp-bg-surface)',
          'surface-hover': 'var(--sp-bg-surface-hover)',
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
    },
  },
  plugins: [],
};

export default config;
