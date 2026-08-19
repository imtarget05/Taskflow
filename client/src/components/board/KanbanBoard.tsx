import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Plus, SquareKanban } from 'lucide-react';
import { useState } from 'react';
import type { BoardData, Column, Task, TaskPriority } from '@/types';
import BoardColumn from '@/components/board/BoardColumn';
import { useCreateColumn, useDeleteColumn, useMoveTask, useUpdateColumn } from '@/hooks/useProjects';
import { Button, EmptyState, Input, useToast } from '@/components/ui';

export interface BoardFilters {
  priority: TaskPriority | 'ALL';
  assigneeId: string | 'ALL';
  showCompleted: boolean;
}

export const ALL_FILTERS: BoardFilters = { priority: 'ALL', assigneeId: 'ALL', showCompleted: true };

export function matchesFilters(task: Task, filters: BoardFilters): boolean {
  if (filters.priority !== 'ALL' && task.priority !== filters.priority) return false;
  if (filters.assigneeId !== 'ALL' && !task.assignments.some((a) => a.user.id === filters.assigneeId)) return false;
  if (!filters.showCompleted && task.completed) return false;
  return true;
}

export function isFiltering(filters: BoardFilters): boolean {
  return JSON.stringify(filters) !== JSON.stringify(ALL_FILTERS);
}

interface KanbanBoardProps {
  board: BoardData;
  projectId: string;
  filters: BoardFilters;
  onTaskClick: (taskId: string) => void;
}

export default function KanbanBoard({ board, projectId, filters, onTaskClick }: KanbanBoardProps) {
  const moveTask = useMoveTask(projectId);
  const createColumn = useCreateColumn(projectId);
  const updateColumn = useUpdateColumn(projectId);
  const deleteColumnMutation = useDeleteColumn(projectId);
  const { toast } = useToast();
  const [newColumnName, setNewColumnName] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const filtering = isFiltering(filters);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const canEdit = board.role === 'OWNER' || board.role === 'MEMBER';

  const columns: Column[] = filtering
    ? board.project.columns.map((column) => ({
        ...column,
        tasks: column.tasks.filter((t) => matchesFilters(t, filters)),
      }))
    : board.project.columns;

  function findColumn(taskId: string) {
    return columns.find((col) => col.tasks.some((t) => t.id === taskId));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (filtering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const fromColumn = findColumn(activeId);
    const toColumn = findColumn(overId);

    // Dropping onto an empty column (over.id is a column id).
    if (!toColumn) {
      const targetColumn = columns.find((c) => c.id === overId);
      if (fromColumn && targetColumn) {
        void moveTask.mutate({
          taskId: activeId,
          sourceColumnId: fromColumn.id,
          targetColumnId: targetColumn.id,
          sourceIndex: fromColumn.tasks.findIndex((t) => t.id === activeId),
          targetIndex: targetColumn.tasks.length,
        });
      }
      return;
    }

    if (!fromColumn) return;

    const fromIndex = fromColumn.tasks.findIndex((t) => t.id === activeId);
    const toIndex = toColumn.tasks.findIndex((t) => t.id === overId);

    if (fromIndex === -1) return;

    // Same column: local reorder.
    if (fromColumn.id === toColumn.id) {
      const updated = arrayMove(fromColumn.tasks, fromIndex, toIndex);
      void moveTask.mutate({
        taskId: activeId,
        sourceColumnId: fromColumn.id,
        targetColumnId: toColumn.id,
        sourceIndex: fromIndex,
        targetIndex: updated.findIndex((t) => t.id === activeId),
      });
    } else {
      void moveTask.mutate({
        taskId: activeId,
        sourceColumnId: fromColumn.id,
        targetColumnId: toColumn.id,
        sourceIndex: fromIndex,
        targetIndex: toIndex,
      });
    }
  }

  async function handleAddColumn() {
    if (!newColumnName.trim()) {
      setAddingColumn(false);
      return;
    }
    try {
      await createColumn.mutateAsync(newColumnName.trim());
      setNewColumnName('');
      setAddingColumn(false);
    } catch {
      toast('error', 'Unable to add column');
    }
  }

  function renameColumn(columnId: string, newName: string) {
    updateColumn.mutate({ columnId, name: newName }, {
      onError: () => toast('error', 'Unable to rename column'),
    });
  }

  function deleteColumn(columnId: string) {
    deleteColumnMutation.mutate(columnId, {
      onError: () => toast('error', 'Unable to delete column'),
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      {columns.length === 0 ? (
        <EmptyState
          icon={<SquareKanban className="h-8 w-8" aria-hidden="true" />}
          title={filtering ? 'No tasks match your filters' : 'No columns yet'}
          description={
            filtering
              ? 'Try clearing the filters above to see more tasks.'
              : canEdit
                ? 'Create your first column to start organizing tasks.'
                : 'An owner or member needs to add a column.'
          }
          className="h-full"
        />
      ) : (
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              projectId={projectId}
              role={board.role}
              onTaskClick={onTaskClick}
              onRename={(name) => renameColumn(column.id, name)}
              onDelete={() => deleteColumn(column.id)}
              dragDisabled={filtering}
            />
          ))}
          {canEdit &&
            (addingColumn ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAddColumn();
                }}
                className="w-60 shrink-0 rounded-xl bg-surface-2 p-3"
              >
                <Input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Column name…"
                  aria-label="New column name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAddingColumn(false);
                  }}
                />
                <div className="mt-2 flex gap-2">
                  <Button type="submit" size="sm">
                    Add
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setAddingColumn(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setAddingColumn(true)}
                className="h-10 w-60 shrink-0 rounded-xl border-2 border-dashed border-line text-ink-muted hover:border-accent hover:text-accent"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add column
              </Button>
            ))}
        </div>
      )}
    </DndContext>
  );
}