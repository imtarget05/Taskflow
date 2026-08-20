import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import ColorPicker from './ColorPicker';
import Button from './Button';

interface ColorPopoverProps {
  value: string | null | undefined;
  onChange: (color: string) => void;
  ariaLabel?: string;
}

export default function ColorPopover({ value, onChange, ariaLabel = 'Change color' }: ColorPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2 text-ink-muted hover:text-ink"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-line"
          style={{ backgroundColor: value ?? 'rgb(var(--accent))' }}
          aria-hidden="true"
        />
        <Palette className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-card p-3 shadow-modal">
          <ColorPicker
            value={value ?? '#6366f1'}
            onChange={(c) => {
              onChange(c);
              setOpen(false);
            }}
            ariaLabel={ariaLabel}
          />
        </div>
      )}
    </div>
  );
}