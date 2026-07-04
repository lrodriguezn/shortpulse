export interface SpinnerProps {
  label?: string;
  size?: 'sm' | 'md';
}

export function Spinner({ label = 'Loading', size = 'md' }: SpinnerProps): React.JSX.Element {
  const sizeClass = size === 'sm' ? 'h-4 w-4 border-2' : 'h-6 w-6 border-[3px]';
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizeClass} text-sp-fg-muted`}
      />
    </span>
  );
}
