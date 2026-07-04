/**
 * `Input` primitive \u2014 label + text input + optional error.
 *
 * Every form field in the SPA wraps this. The label is bound to
 * the input via `htmlFor`/`id` (accessibility); the error message
 * has `role="alert"` so screen readers announce it as soon as
 * it appears. The component forwards every native input prop so
 * callers don't lose `name`, `autoComplete`, `aria-*`, etc.
 */
import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label rendered above the input. */
  label: string;
  /** Error message \u2014 sets `aria-invalid` and renders the text under the field. */
  error?: string;
}

/**
 * Default `id` is generated via `useId()` so the label/input
 * binding is unique per instance even when the primitive is
 * rendered multiple times in the same view. Callers can override
 * `id` explicitly when they need to wire the input to an
 * external label (e.g. a form library's field-id convention).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `input-${autoId}`;
  const describedBy = error ? `${inputId}-error` : undefined;

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-800">{label}</span>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'block w-full rounded-md border px-3 py-2 text-sm shadow-sm',
          'placeholder:text-neutral-400 focus:outline-none focus:ring-2',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
            : 'border-neutral-300 focus:border-neutral-500 focus:ring-neutral-200',
          'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {error ? (
        <span id={describedBy} role="alert" className="mt-1 block text-sm text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
});
