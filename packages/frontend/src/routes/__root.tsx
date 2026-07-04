import { Link, Outlet } from '@tanstack/react-router';
import { ThemeToggle } from '../components/ui/theme-toggle.js';

export function RootLayout(): React.JSX.Element {
  return (
    <div className="min-h-full">
      <header className="border-b border-sp-border bg-sp-surface">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"
        >
          <Link to="/" className="text-lg font-semibold text-sp-accent hover:text-sp-accent-hover">
            ShortPulse
          </Link>
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
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
