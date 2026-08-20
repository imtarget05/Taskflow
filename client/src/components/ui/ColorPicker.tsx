import { useState } from 'react';
import { Check } from 'lucide-react';

// eslint-disable-next-line react-refresh/only-export-components
export const PRESET_COLORS = [
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#10b981', // emerald
  '#84cc16', // lime
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#64748b', // slate
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  ariaLabel?: string;
}

export default function ColorPicker({ value, onChange, ariaLabel = 'Color' }: ColorPickerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');

  function commitCustom() {
    const hex = custom.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onChange(hex.toLowerCase());
      setCustomOpen(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-full border-2 border-surface-3 shadow-card"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink" style={{ color: value }}>
            {value.toUpperCase()}
          </p>
          <p className="text-xs text-ink-muted">Project accent color</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c}
            aria-label={`Color ${c}`}
            onClick={() => onChange(c)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              value.toLowerCase() === c ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
            }`}
            style={{ backgroundColor: c }}
          >
            {value.toLowerCase() === c && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={!PRESET_COLORS.includes(value.toLowerCase())}
          aria-label="Custom color"
          onClick={() => setCustomOpen((v) => !v)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-line bg-surface text-ink-muted transition-colors hover:text-ink ${
            !PRESET_COLORS.includes(value.toLowerCase()) ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
          }`}
        >
          <span className="text-[10px] font-bold">+</span>
        </button>
      </div>

      {customOpen && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
          <label className="sr-only" htmlFor="color-custom">
            Custom hex color
          </label>
          <input
            id="color-custom"
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : value}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={commitCustom}
            className="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5"
            aria-label="Pick custom color"
          />
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
              if (e.key === 'Escape') setCustomOpen(false);
            }}
            onBlur={commitCustom}
            placeholder="#RRGGBB"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-accent"
            aria-label="Custom hex color"
          />
          <button
            type="button"
            onClick={commitCustom}
            className="rounded-md px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}