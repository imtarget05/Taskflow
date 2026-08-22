interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Optional action rendered on the trailing edge (button, link…). */
  action?: React.ReactNode;
  /** Heading level for document outline; visual size stays "section". */
  level?: 1 | 2 | 3 | 4;
  id?: string;
  className?: string;
}

/**
 * Semantic section header: title + optional description + optional action.
 * Used by dashboard sections, landing sections and settings groups.
 */
export default function SectionHeading({
  title,
  description,
  action,
  level = 2,
  id,
  className = '',
}: SectionHeadingProps) {
  const Tag = `h${level}` as React.ElementType;
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <Tag id={id} className="type-section-title text-ink">
          {title}
        </Tag>
        {description && <p className="type-caption mt-1 max-w-prose text-ink-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
