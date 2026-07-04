import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="empty-state-title"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-sp-border bg-sp-surface px-6 py-12 text-center"
    >
      <h2 id="empty-state-title" className="text-base font-semibold text-sp-fg">
        {title}
      </h2>
      {description ? <p className="max-w-sm text-sm text-sp-fg-dim">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
