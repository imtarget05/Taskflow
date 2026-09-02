import { forwardRef } from 'react';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tonal' | 'outlined' | 'elevated';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-onPrimary hover:opacity-90 shadow-elevation1',
  secondary:
    'border border-line bg-surface text-ink hover:bg-surface-2 dark:text-ink-secondary',
  ghost: 'text-ink-secondary hover:bg-surface-2 hover:text-ink',
  danger: 'bg-error text-white hover:opacity-90',
  tonal: 'bg-secondaryContainer text-onSecondaryContainer hover:opacity-90',
  outlined: 'border border-outline text-primary hover:bg-primaryContainer/20',
  elevated: 'bg-surfaceContainerLow text-primary shadow-elevation1 hover:shadow-elevation2',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className = '', disabled, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export default Button;