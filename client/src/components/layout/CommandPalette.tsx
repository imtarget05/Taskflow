import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Search, X } from 'lucide-react';
import api from '@/lib/api';
import { useProjects } from '@/hooks/useProjects';
import { Avatar, Button } from '@/components/ui';

interface SearchResult {
  id: string;
  title: string;
  completed: boolean;
  projectId: string;
  project: { name: string; color: string | null };
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results, isFetching } = useQuery({
    queryKey: ['search', query.trim()],
    enabled: open && query.trim().length > 0,
    queryFn: async () => {
      const res = await api.get<{ data: SearchResult[] }>('/search', { params: { q: query.trim() } });
      return res.data.data;
    },
  });

  // Reset query when pallet opens; keep focus in the input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  // Global keyboard shortcut: Cmd/Ctrl + K toggles the palette.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [query, open]);

  const projectResults = query.trim()
    ? (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const taskResults = results ?? [];

  function selectItem(item: { type: 'project' | 'task'; id: string; projectId?: string }) {
    if (item.type === 'project') {
      navigate(`/projects/${item.id}`);
    } else {
      navigate(`/projects/${item.projectId}?task=${item.id}`);
    }
    onClose();
  }

  const rows = [
    ...projectResults.map((p) => ({ type: 'project' as const, id: p.id, name: p.name, subtitle: 'Project', completed: false })),
    ...taskResults.map((t) => ({ type: 'task' as const, id: t.id, name: t.title, subtitle: t.project.name, completed: t.completed })),
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-modal"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            const item = rows[activeIndex];
            if (item) selectItem(item);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks & projects…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            aria-label="Search tasks and projects"
          />
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2" aria-label="Close search">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <ul className="max-h-80 overflow-y-auto py-2" role="listbox" aria-label="Search results">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-muted">
              {query.trim() ? 'No matches found.' : 'Start typing to search across your projects.'}
            </li>
          )}
          {rows.map((item, index) => (
            <li key={`${item.type}-${item.id}`} role="option" aria-selected={index === activeIndex}>
              <button
                onClick={() => selectItem(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  index === activeIndex ? 'bg-surface-2' : ''
                }`}
              >
                <Avatar name={item.name} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium text-ink ${item.type === 'task' && item.completed ? 'text-ink-muted line-through' : ''}`}>
                    {item.name}
                  </span>
                  <span className="block text-xs text-ink-muted">{item.subtitle}</span>
                </span>
                {index === activeIndex && (
                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
          {isFetching && query.trim().length > 0 && (
            <li className="px-4 py-2 text-sm text-ink-muted">Searching…</li>
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-muted">
          <span><kbd className="rounded bg-surface-2 px-1.5 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="rounded bg-surface-2 px-1.5 py-0.5">↵</kbd> open</span>
          <span><kbd className="rounded bg-surface-2 px-1.5 py-0.5">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}