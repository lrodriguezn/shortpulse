/**
 * `EmptyState` primitive \u2014 the "no data" affordance.
 *
 * Used by the Links page when the user has no links yet and by
 * the Analytics page when there's no data in the selected range.
 * Pure presentation: composes an icon, a title, a description,
 * and an optional action slot. The action is rendered as-is
 * (typically a `<Button>` or a `<Link>`) so callers keep full
 * control of the CTA.
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Short title \u2014 typically one or two words ("No hay enlaces a\u00fan"). */
  title: string;
  /** One-line description of what the user can do next. */
  description?: string;
  /** Optional CTA slot \u2014 typically a Button or a Link. */
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="empty-state-title"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-12 text-center"
    >
      <h2 id="empty-state-title" className="text-base font-semibold text-neutral-800">
        {title}
      </h2>
      {description ? <p className="max-w-sm text-sm text-neutral-600">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
