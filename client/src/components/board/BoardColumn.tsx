import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column } from '@/types';
import TaskCard from '@/components/task/TaskCard';
import { useCreateTask } from '@/hooks/useProjects';

interface ColumnProps {
  column: Column;
  projectId: string;
  role: string;
  onTaskClick: (taskId: string) => void;
}

export default function BoardColumn({ column, projectId, role, onTaskClick }: ColumnProps) {
  const createTask = useCreateTask();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const canEdit = role === 'OWNER' || role === 'MEMBER';

  async function handleAdd() {
    if (!title.trim()) {
      setAdding(false);
      return;
    }
    await createTask.mutateAsync({ projectId, columnId: column.id, title });
    setTitle('');
    setAdding(false);
  }

  return (
    <div className="w-72 shrink-0 rounded-xl bg-slate-100 p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="font-semibold text-slate-700">
          {column.name}
          <span className="ml-2 text-xs text-slate-400">{column.tasks.length}</span>
        </h3>
      </div>

      <SortableContext
        items={column.tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-[40px]">
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
          ))}
        </div>
      </SortableContext>

      {canEdit &&
        (adding ? (
          <div className="mt-2">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title…"
              className="input"
              rows={2}
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <button onClick={() => void handleAdd()} className="btn-primary text-xs">
                Add task
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setTitle('');
                }}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-200"
          >
            + Add a task
          </button>
        ))}
    </div>
  );
}
