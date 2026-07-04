import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `input-${autoId}`;
  const describedBy = error ? `${inputId}-error` : undefined;

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1 block text-sm font-medium text-sp-fg-dim">{label}</span>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'block w-full rounded-lg border px-3 h-11 text-sm shadow-sm',
          'bg-sp-bg text-sp-fg placeholder:text-sp-fg-muted',
          'focus:outline-none focus:ring-2',
          error
            ? 'border-sp-error focus:border-sp-error focus:ring-sp-error-subtle'
            : 'border-sp-border focus:border-sp-accent focus:ring-sp-accent-subtle',
          'disabled:cursor-not-allowed disabled:bg-sp-bg-m1 disabled:text-sp-fg-muted',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {error ? (
        <span id={describedBy} role="alert" className="mt-1 block text-sm text-sp-error">
          {error}
        </span>
      ) : null}
    </label>
  );
});
