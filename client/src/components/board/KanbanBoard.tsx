import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { useMemo } from 'react';
import type { BoardData } from '@/types';
import BoardColumn from '@/components/board/BoardColumn';
import { useMoveTask } from '@/hooks/useProjects';

interface KanbanBoardProps {
  board: BoardData;
  projectId: string;
  onTaskClick: (taskId: string) => void;
}

export default function KanbanBoard({ board, projectId, onTaskClick }: KanbanBoardProps) {
  const moveTask = useMoveTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
          projectId,
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
        projectId,
        sourceColumnId: fromColumn.id,
        targetColumnId: toColumn.id,
        sourceIndex: fromIndex,
        targetIndex: updated.findIndex((t) => t.id === activeId),
      });
    } else {
      void moveTask.mutate({
        projectId,
        sourceColumnId: fromColumn.id,
        targetColumnId: toColumn.id,
        sourceIndex: fromIndex,
        targetIndex: toIndex,
      });
    }
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}