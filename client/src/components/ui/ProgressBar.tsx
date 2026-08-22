interface ProgressBarProps {
  /** 0–100. Values outside are clamped. */
  value: number;
  label?: string;
  tone?: 'accent' | 'success';
  size?: 'sm' | 'md';
  className?: string;
}

/** Determinate progress bar with accessible semantics. */
export default function ProgressBar({ value, label, tone = 'accent', size = 'md', className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const track = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const fill = tone === 'success' ? 'bg-success' : 'bg-accent';
  return (
    <div className={`w-full ${className}`}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={`w-full overflow-hidden rounded-full bg-surface-muted ${track}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${fill}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
