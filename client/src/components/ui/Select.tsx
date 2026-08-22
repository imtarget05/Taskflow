import { forwardRef, useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  /** Placeholder-style first option (value=""). */
  placeholder?: string;
}

/**
 * Form select built on the native <select> for full accessibility and mobile
 * picker support. The existing <Dropdown/> is an action menu, not a form
 * control — use Select for form fields.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, options, placeholder, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block w-full appearance-none rounded-lg border bg-surface px-3 py-2 text-sm text-ink shadow-card focus:outline-none focus:ring-1 disabled:pointer-events-none disabled:opacity-60 ${
          error
            ? 'border-danger focus:border-danger focus:ring-danger'
            : 'border-line focus:border-accent focus:ring-accent'
        } ${className}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238B96A5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.625rem center',
          paddingRight: '2.25rem',
        }}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled={rest.required}>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${selectId}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Select;
