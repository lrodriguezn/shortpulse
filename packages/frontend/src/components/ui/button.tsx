import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { Spinner } from './spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-sp-accent text-white hover:bg-sp-accent-hover focus-visible:ring-sp-accent disabled:bg-sp-fg-muted',
  secondary:
    'bg-sp-surface text-sp-fg border border-sp-border hover:bg-sp-surface-hover focus-visible:ring-sp-accent disabled:bg-sp-bg-m1 disabled:text-sp-fg-muted',
  ghost:
    'bg-transparent text-sp-fg-dim hover:bg-sp-surface-hover focus-visible:ring-sp-accent disabled:text-sp-fg-muted',
  danger:
    'bg-sp-error text-white hover:bg-red-700 focus-visible:ring-sp-error disabled:bg-sp-error-subtle',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-colors focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg ' +
  'disabled:cursor-not-allowed';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

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
