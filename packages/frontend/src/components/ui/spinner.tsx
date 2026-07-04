/**
 * `Spinner` primitive \u2014 the loading affordance.
 *
 * Used by the `Button` (in its `loading` state) and by the data
 * panels (table load, KPI cards, redirect-after-create). The
 * component renders a `role="status"` element with an `aria-label`
 * so assistive tech announces the busy state without dumping the
 * decorative SVG into the accessibility tree. The visible
 * animation is the classic spinning ring (CSS animation \u2014 no
 * JS state, no re-render churn).
 */
export interface SpinnerProps {
  /** Accessible label. Defaults to "Loading" so the role is never silent. */
  label?: string;
  /** Visual size \u2014 the `sm` variant is what the Button consumes inline. */
  size?: 'sm' | 'md';
}

export function Spinner({ label = 'Loading', size = 'md' }: SpinnerProps): React.JSX.Element {
  const sizeClass = size === 'sm' ? 'h-4 w-4 border-2' : 'h-6 w-6 border-[3px]';
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizeClass} text-neutral-500`}
      />
    </span>
  );
}
