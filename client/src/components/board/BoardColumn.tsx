import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Column } from '@/types';
import TaskCard from '@/components/task/TaskCard';
import { useCreateTask } from '@/hooks/useProjects';
import { Button, ConfirmDialog, Input, Textarea } from '@/components/ui';

interface ColumnProps {
  column: Column;
  projectId: string;
  role: string;
  onTaskClick: (taskId: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  dragDisabled?: boolean;
}

export default function BoardColumn({ column, projectId, role, onTaskClick, onRename, onDelete, dragDisabled = false }: ColumnProps) {
  const createTask = useCreateTask();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = role === 'OWNER' || role === 'MEMBER';

  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  async function handleAdd() {
    if (!title.trim()) {
      setAdding(false);
      return;
    }
    await createTask.mutateAsync({ projectId, columnId: column.id, title: title.trim() });
    setTitle('');
    setAdding(false);
  }

  function handleRenameSubmit() {
    if (renameValue.trim() && renameValue.trim() !== column.name) {
      onRename(renameValue.trim());
    }
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-xl bg-surface-2 p-3 transition-shadow ${
        isOver ? 'ring-2 ring-accent' : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameSubmit();
            }}
            className="flex flex-1 items-center gap-1"
          >
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="text-sm"
              aria-label="Column name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <Button type="submit" variant="ghost" size="sm" aria-label="Save column name" className="px-2">
              <Check className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} aria-label="Cancel rename" className="px-2">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <span className="truncate">{column.name}</span>
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
              {column.tasks.length}
            </span>
          </h3>
        )}
        {canEdit && !editing && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRenameValue(column.name);
                setEditing(true);
              }}
              aria-label={`Rename column ${column.name}`}
              className="px-1.5 text-ink-muted hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete column ${column.name}`}
              className="px-1.5 text-ink-muted hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <SortableContext
        items={column.tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={`min-h-[56px] ${column.tasks.length === 0 ? 'rounded-lg border border-dashed border-line' : ''}`}>
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} disabled={dragDisabled} />
          ))}
        </div>
      </SortableContext>

      {canEdit &&
        (adding ? (
          <div className="mt-3">
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title…"
              rows={2}
              autoFocus
              aria-label="New task title"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleAdd();
                }
                if (e.key === 'Escape') {
                  setAdding(false);
                  setTitle('');
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void handleAdd()} loading={createTask.isPending}>
                Add task
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setTitle('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className="mt-2 w-full justify-start text-ink-muted"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add a task
          </Button>
        ))}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title={`Delete "${column.name}"?`}
        message="Its tasks will be moved to another column. This cannot be undone."
        confirmLabel="Delete column"
      />
    </div>
  );
}