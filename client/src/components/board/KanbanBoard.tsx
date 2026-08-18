import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { useMemo, useState } from 'react';
import type { BoardData } from '@/types';
import BoardColumn from '@/components/board/BoardColumn';
import { useCreateColumn, useDeleteColumn, useMoveTask, useUpdateColumn } from '@/hooks/useProjects';

interface KanbanBoardProps {
  board: BoardData;
  projectId: string;
  onTaskClick: (taskId: string) => void;
}

export default function KanbanBoard({ board, projectId, onTaskClick }: KanbanBoardProps) {
  const moveTask = useMoveTask(projectId);
  const createColumn = useCreateColumn(projectId);
  const updateColumn = useUpdateColumn(projectId);
  const deleteColumnMutation = useDeleteColumn(projectId);
  const [newColumnName, setNewColumnName] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canEdit = board.role === 'OWNER' || board.role === 'MEMBER';

    // Global list of task ids for nested SortableContext (kept for future use).
  const columnIds = useMemo(() => board.project.columns.map((c) => c.id), [board.project.columns]);

  function findColumn(taskId: string) {
    return board.project.columns.find((col) => col.tasks.some((t) => t.id === taskId));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const fromColumn = findColumn(activeId);
    const toColumn = findColumn(overId);

    // Dropping onto an empty column (over.id is a column id).
    if (!toColumn) {
      const targetColumn = board.project.columns.find((c) => c.id === overId);
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
    await createColumn.mutateAsync(newColumnName.trim());
    setNewColumnName('');
    setAddingColumn(false);
  }

  async function renameColumn(columnId: string, newName: string) {
    if (!newName.trim()) return;
    await updateColumn.mutateAsync({ columnId, name: newName.trim() });
  }

  async function deleteColumn(columnId: string, colName: string) {
    if (!window.confirm(`Delete column "${colName}"? Its tasks will be moved to another column.`)) return;
    await deleteColumnMutation.mutateAsync(columnId);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <SortableContext items={columnIds}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {board.project.columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              projectId={projectId}
              role={board.role}
              onTaskClick={onTaskClick}
              onRename={(name) => renameColumn(column.id, name)}
              onDelete={() => deleteColumn(column.id, column.name)}
            />
          ))}
          {canEdit &&
            (addingColumn ? (
              <div className="w-60 shrink-0 rounded-xl bg-slate-100 p-3">
                <input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Column name…"
                  className="input mb-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAddColumn();
                    if (e.key === 'Escape') setAddingColumn(false);
                  }}
                />
                <div className="flex gap-2">
                  <button onClick={() => void handleAddColumn()} className="btn-primary text-xs">
                    Add
                  </button>
                  <button onClick={() => setAddingColumn(false)} className="btn-ghost text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="h-10 w-60 shrink-0 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600"
              >
                + Add column
              </button>
            ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}