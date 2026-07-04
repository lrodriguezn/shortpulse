/**
 * `ErrorBoundary` primitive \u2014 catches render-phase exceptions.
 *
 * React error boundaries are class components (no functional
 * equivalent yet). The ShortPulse boundary renders the
 * spec-locked Spanish fallback ("Algo sali\u00f3 mal" + "Reintentar")
 * and exposes a retry affordance that reloads the current route.
 * It's mounted at the root layout level (in `RootLayout`) so a
 * render error in any child route degrades gracefully instead of
 * leaving the user on a blank page.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback. Defaults to the spec-locked copy. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Reusable error boundary. The retry handler is a single-purpose
 * `window.location.reload()` call \u2014 we deliberately do NOT
 * reset internal state because we cannot know which child caused
 * the failure. A full page reload is the safe, deterministic
 * recovery path.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production this would forward to a logging sink.
    // We keep the console call so the dev server surfaces the
    // stack trace next to the rendered fallback.
    console.error('ErrorBoundary caught:', error, info);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  override render(): ReactNode {
    const { children, fallback } = this.props;
    const { error } = this.state;
    if (error) {
      if (fallback) {
        return fallback(error, this.retry);
      }
      return (
        <section
          role="alert"
          aria-labelledby="error-boundary-title"
          className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center"
        >
          <h1 id="error-boundary-title" className="text-lg font-semibold text-neutral-900">
            Algo salió mal
          </h1>
          <p className="text-sm text-neutral-600">
            No pudimos cargar esta vista. Vuelve a intentarlo.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
          >
            Reintentar
          </button>
        </section>
      );
    }
    return children;
  }
}
