/**
 * Barrel export for the presentational UI primitives.
 *
 * Importing from `@/components/ui` keeps feature code free of
 * deep paths: `import { Button, Input } from '@/components/ui'`
 * is the only line a feature component ever needs.
 */
export { Button } from './button.js';
export type { ButtonProps, ButtonSize, ButtonVariant } from './button.js';

export { Input } from './input.js';
export type { InputProps } from './input.js';

export { Spinner } from './spinner.js';
export type { SpinnerProps } from './spinner.js';

export { EmptyState } from './empty-state.js';
export type { EmptyStateProps } from './empty-state.js';

export { ErrorBoundary } from './error-boundary.js';
export type { ErrorBoundaryProps } from './error-boundary.js';
