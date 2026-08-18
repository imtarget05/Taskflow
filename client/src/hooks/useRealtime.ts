import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import type { BoardData, Comment, Task } from '@/types';

type TaskMove = {
  taskId: string;
  sourceColumnId: string;
  targetColumnId: string;
  targetIndex: number;
};

const boardKey = (projectId: string) => ['board', projectId] as const;

function patchBoard(
  current: BoardData | undefined,
  patch: (board: BoardData) => BoardData
): BoardData | undefined {
  return current ? patch(current) : current;
}

export function useRealtime(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      withCredentials: true,
      transports: ['websocket'],
    });
    socketRef.current = socket;
    const joinBoard = () => socket.emit('board:join', { projectId });

    const handleTaskCreated = (task: Task) => {
      queryClient.setQueryData<BoardData>(boardKey(projectId), (current) =>
        patchBoard(current, (board) => ({
          ...board,
          project: {
            ...board.project,
            columns: board.project.columns.map((column) =>
              column.id === task.columnId
                ? { ...column, tasks: [...column.tasks, task].sort((a, b) => a.position - b.position) }
                : column
            ),
          },
        }))
      );
    };

    const handleTaskUpdated = (task: Task) => {
      queryClient.setQueryData<BoardData>(boardKey(projectId), (current) =>
        patchBoard(current, (board) => ({
          ...board,
          project: {
            ...board.project,
            columns: board.project.columns.map((column) => ({
              ...column,
              tasks: column.tasks.map((item) => (item.id === task.id ? { ...item, ...task } : item)),
            })),
          },
        }))
      );
    };

    const handleTaskDeleted = ({ id }: { id: string }) => {
      queryClient.setQueryData<BoardData>(boardKey(projectId), (current) =>
        patchBoard(current, (board) => ({
          ...board,
          project: {
            ...board.project,
            columns: board.project.columns.map((column) => ({
              ...column,
              tasks: column.tasks.filter((task) => task.id !== id),
            })),
          },
        }))
      );
    };

    const handleTaskMoved = (move: TaskMove) => {
      queryClient.setQueryData<BoardData>(boardKey(projectId), (current) =>
        patchBoard(current, (board) => {
          const moved = board.project.columns.flatMap((column) => column.tasks).find((task) => task.id === move.taskId);
          if (!moved) return board;
          return {
            ...board,
            project: {
              ...board.project,
              columns: board.project.columns.map((column) => {
                const withoutTask = column.tasks.filter((task) => task.id !== move.taskId);
                if (column.id !== move.targetColumnId) return { ...column, tasks: withoutTask };
                const tasks = [...withoutTask];
                tasks.splice(move.targetIndex, 0, { ...moved, columnId: column.id, position: move.targetIndex });
                return { ...column, tasks };
              }),
            },
          };
        })
      );
    };

    const handleCommentAdded = (comment: Comment) => {
      queryClient.setQueryData<BoardData>(boardKey(projectId), (current) =>
        patchBoard(current, (board) => ({
          ...board,
          project: {
            ...board.project,
            columns: board.project.columns.map((column) => ({
              ...column,
              tasks: column.tasks.map((task) =>
                task.id === comment.taskId
                  ? { ...task, comments: [...(task.comments ?? []), comment] }
                  : task
              ),
            })),
          },
        }))
      );
    };

        socket.on('connect', joinBoard);
    socket.on('task:created', handleTaskCreated);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('task:deleted', handleTaskDeleted);
    socket.on('task:moved', handleTaskMoved);
    socket.on('comment:added', handleCommentAdded);
    socket.on('activity:created', () => void queryClient.invalidateQueries({ queryKey: ['activities', projectId] }));
    socket.on('column:created', () => void queryClient.invalidateQueries({ queryKey: boardKey(projectId) }));
    socket.on('column:updated', () => void queryClient.invalidateQueries({ queryKey: boardKey(projectId) }));
    socket.on('column:deleted', () => void queryClient.invalidateQueries({ queryKey: boardKey(projectId) }));
    socket.on('member:added', () => void queryClient.invalidateQueries({ queryKey: boardKey(projectId) }));
    socket.on('member:removed', () => void queryClient.invalidateQueries({ queryKey: boardKey(projectId) }));

    return () => {
      socket.emit('board:leave', { projectId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId, queryClient]);

  return socketRef.current;
}
