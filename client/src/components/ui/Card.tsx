import { forwardRef } from 'react';

type Variant = 'filled' | 'elevated' | 'outlined' | 'interactive';

const VARIANTS: Record<Variant, string> = {
  filled: 'bg-surfaceContainerLow',
  elevated: 'bg-surfaceContainerLow shadow-elevation2',
  outlined: 'border border-outlineVariant bg-surface',
  interactive:
    'bg-surfaceContainerLow shadow-elevation1 card-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:shadow-elevation2',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Render as a clickable element (interactive variant becomes a button-like div). */
  as?: 'div' | 'article' | 'section';
}

/**
 * M3 surface container. Prefer this over the legacy `.card` utility.
 * Padding is left to the caller (convention: p-4 / p-5).
 */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'filled', as = 'div', className = '', children, ...rest },
  ref
) {
  const Tag = as;
  return (
    <Tag
      ref={ref}
      tabIndex={variant === 'interactive' ? 0 : undefined}
      className={`rounded-2xl ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Card;
