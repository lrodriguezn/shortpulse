import { Link, Outlet } from '@tanstack/react-router';
import { ThemeToggle } from '../components/ui/theme-toggle.js';

export function RootLayout(): React.JSX.Element {
  return (
    <div className="min-h-full">
      <header className="border-b border-sp-border bg-sp-bg">
        <nav
          aria-label="Principal"
          className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-8"
        >
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
        </nav>
      </header>
      <main className="mx-auto max-w-[1200px] px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
