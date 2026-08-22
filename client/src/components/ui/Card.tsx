import { forwardRef } from 'react';

type Variant = 'default' | 'elevated' | 'interactive';

const VARIANTS: Record<Variant, string> = {
  default: 'border border-line bg-surface shadow-card',
  elevated: 'border border-border-subtle bg-elevated shadow-card-hover',
  interactive:
    'border border-line bg-surface shadow-card card-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Render as a clickable element (interactive variant becomes a button-like div). */
  as?: 'div' | 'article' | 'section';
}

/**
 * Semantic surface container. Prefer this over the legacy `.card` utility in
 * new work; padding is left to the caller (convention: p-4 / p-5).
 */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', as = 'div', className = '', children, ...rest },
  ref
) {
  const Tag = as;
  return (
    <Tag
      ref={ref}
      tabIndex={variant === 'interactive' ? 0 : undefined}
      className={`rounded-xl ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Card;
