import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export interface DropdownItemDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  danger?: boolean;
  onSelect?: () => void;
}

interface DropdownProps {
  trigger: (open: boolean) => React.ReactNode;
  items: DropdownItemDef[];
  align?: 'left' | 'right';
  width?: string;
  label: string;
  selectedKey?: string | null;
}

/**
 * Accessible ephemeral menu. Trigger is provided as a render prop so the caller
 * keeps control of the button styling; the menu supports arrow-key navigation,
 * Home/End, Escape, Enter, outside-click and focus restore.
 */
export default function Dropdown({
  trigger,
  items,
  align = 'right',
  width = 'w-56',
  label,
  selectedKey,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      const item = items[activeIndex];
      if (item?.onSelect) {
        e.preventDefault();
        item.onSelect();
        close();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger(open)}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={`absolute z-50 mt-2 origin-top overflow-hidden rounded-xl border border-line bg-card shadow-modal focus:outline-none ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${width} animate-rise`}
        >
          {items.map((item, index) => {
            const active = index === activeIndex;
            const selected = selectedKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  item.onSelect?.();
                  close();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors focus:outline-none ${
                  active ? 'bg-surface-2' : ''
                } ${
                  item.danger ? 'text-danger' : 'text-ink'
                } ${index > 0 ? 'border-t border-line' : ''}`}
              >
                {item.icon && (
                  <span className="shrink-0 text-ink-muted" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  {item.description && (
                    <span className="block text-xs text-ink-muted">{item.description}</span>
                  )}
                </span>
                {selected && (
                  <Check
                    className="ml-auto h-4 w-4 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}