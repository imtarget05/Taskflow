import { useId } from 'react';

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const PLACEMENT: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)]',
  bottom: 'top-full left-1/2 -translate-x-1/2 top-[calc(100%+6px)]',
  left: 'right-full top-1/2 -translate-y-1/2 right-[calc(100%+6px)]',
  right: 'left-full top-1/2 -translate-y-1/2 left-[calc(100%+6px)]',
};

const ARROW: Record<string, string> = {
  top: 'left-1/2 -translate-x-1/2 top-full',
  bottom: 'left-1/2 -translate-x-1/2 bottom-full',
  left: 'top-1/2 -translate-y-1/2 left-full',
  right: 'top-1/2 -translate-y-1/2 right-full',
};

/**
 * Lightweight accessible tooltip. Renders the child trigger and a label that
 * appears on hover and keyboard focus. The trigger keeps its semantics (the
 * tooltip text is visually hidden until triggered, announced via aria).
 */
export default function Tooltip({ label, children, side = 'top', className = '' }: TooltipProps) {
  const id = useId();

  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        id={id}
        className={`pointer-events-none absolute z-40 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg shadow-card transition-opacity opacity-0 group-hover:opacity-100 ${PLACEMENT[side]}`}
      >
        {label}
        <span
          aria-hidden="true"
          className={`absolute h-2 w-2 rotate-45 bg-ink ${ARROW[side]}`}
        />
      </span>
    </span>
  );
}