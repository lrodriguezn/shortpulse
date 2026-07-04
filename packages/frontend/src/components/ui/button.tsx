/**
 * `Button` primitive \u2014 the workhorse of the UI.
 *
 * Variants map to design-locked color roles. Sizes are presentational
 * only. The `loading` state replaces the label with a Spinner and
 * disables the button so it can't be activated twice; the button
 * announces the busy state via `aria-busy` for assistive tech.
 *
 * Why a primitive and not `<button className="...">` inline: forms
 * (Create Link, Delete confirmation), tables (Copy/Open row actions),
 * and the 404 recovery control all consume the same control. A
 * single primitive keeps spacing, focus rings, and disabled/loading
 * states consistent across the app.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { Spinner } from './spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-neutral-900 text-white hover:bg-neutral-800 focus-visible:ring-neutral-500 disabled:bg-neutral-400',
  secondary:
    'bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 focus-visible:ring-neutral-400 disabled:bg-neutral-100 disabled:text-neutral-400',
  ghost:
    'bg-transparent text-neutral-700 hover:bg-neutral-100 focus-visible:ring-neutral-400 disabled:text-neutral-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 disabled:bg-red-300',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-colors focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-white ' +
  'disabled:cursor-not-allowed';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Visible label (kept mandatory so every Button has accessible text). */
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true, replaces the label with a Spinner and disables the button. */
  loading?: boolean;
}

/**
 * The default `type` is `"button"` so the primitive never accidentally
 * submits a surrounding `<form>`. Callers that need submit behaviour
 * pass `type="submit"` explicitly (covered by the test in
 * `button.test.tsx`).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    type = 'button',
    className,
    disabled,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const classes = [BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : null}
      <span>{children}</span>
    </button>
  );
});
