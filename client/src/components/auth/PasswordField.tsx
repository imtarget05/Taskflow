import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Input from '@/components/ui/Input';

interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Password input with a visibility toggle. Wraps the standard Input so
 * styling/aria behaviour stays identical; toggle button is keyboard
 * accessible and labelled.
 */
const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { label = 'Password', error, hint, ...rest },
  ref
) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const describedBy = error ? `${autoId}-error` : hint ? `${autoId}-hint` : undefined;
  return (
    <div className="relative">
      <Input
        ref={ref}
        id={autoId}
        label={label}
        type={visible ? 'text' : 'password'}
        error={error}
        hint={hint}
        aria-describedby={describedBy}
        className="pr-11"
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-2 top-[34px] rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});

export default PasswordField;
