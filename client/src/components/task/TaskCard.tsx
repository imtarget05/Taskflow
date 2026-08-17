import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '@/types';

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
};

export default function TaskCard({ task, onClick }: { task: Task; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`card mb-2 cursor-grab select-none p-3 active:cursor-grabbing ${
        isDragging ? 'opacity-50 ring-2 ring-brand-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{task.title}</p>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.MEDIUM}`}>
          {task.priority}
        </span>
      </div>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</p>
      )}

      {task.dueDate && (
        <p className="mt-2 text-xs text-slate-400">
          Due {new Date(task.dueDate).toLocaleDateString()}
        </p>
      )}

      {task.assignments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.assignments.map((a) => (
            <span
              key={a.id}
              title={a.user.name}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700"
            >
              {a.user.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
