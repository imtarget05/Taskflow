import { useId, useRef } from 'react';

export interface TabDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabDef[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Accessible name describing what the tablist controls. */
  label: string;
  className?: string;
}

/**
 * Accessible tab strip (roving tabindex, arrow-key navigation per WAI-ARIA).
 * Only render panels relevant to real features — do not add decorative tabs.
 */
export default function Tabs({ tabs, activeKey, onChange, label, className = '' }: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function move(delta: number) {
    const index = tabs.findIndex((t) => t.key === activeKey);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.key);
    // Focus follows selection (roving tabindex).
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-${next.key}`)}`)
        ?.focus();
    });
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            id={`${baseId}-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'bg-accent-soft text-accent-ink' : 'text-ink-secondary hover:bg-surface-muted hover:text-ink'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
