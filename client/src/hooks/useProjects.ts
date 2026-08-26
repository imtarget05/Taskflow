import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { uuid } from '@/lib/uuid';
import type { Activity, BoardData, ChatGroup, ChatMessage, Comment, ProjectSummary, Role, Task, TaskPriority, User } from '@/types';

const boardKey = (projectId: string) => ['board', projectId] as const;

function updateBoard(
  board: BoardData | undefined,
  update: (current: BoardData) => BoardData
): BoardData | undefined {
  return board ? update(board) : board;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<{ data: ProjectSummary[] }>('/projects');
      return res.data.data;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      color?: string;
      columnNames?: string[];
    }) => {
      const res = await api.post<{ data: { id: string } }>('/projects', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useBoard(projectId: string | undefined) {
  return useQuery({
    queryKey: ['board', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await api.get<{ data: BoardData }>(`/projects/${projectId}`);
      return res.data.data;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      columnId: string;
      title: string;
      description?: string;
      priority?: TaskPriority;
      dueDate?: string;
      assigneeIds?: string[];
    }) => {
      const res = await api.post<{ data: Task }>(`/projects/${data.projectId}/tasks`, data);
      return res.data.data;
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: boardKey(variables.projectId) });
      const previousBoard = qc.getQueryData<BoardData>(boardKey(variables.projectId));
      const optimistic: Task = {
        id: `optimistic-${uuid()}`,
        projectId: variables.projectId, columnId: variables.columnId, title: variables.title,
        description: variables.description, dueDate: variables.dueDate, priority: variables.priority ?? 'MEDIUM',
        position: Number.MAX_SAFE_INTEGER, completed: false, createdById: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assignments: [],
      };
      qc.setQueryData<BoardData>(boardKey(variables.projectId), (board) => updateBoard(board, (current) => ({
        ...current,
        project: { ...current.project, columns: current.project.columns.map((column) =>
          column.id === variables.columnId ? { ...column, tasks: [...column.tasks, optimistic] } : column) },
      })));
      return { previousBoard };
    },
    onError: (_, variables, context) => {
      if (context?.previousBoard) {
        qc.setQueryData<BoardData>(boardKey(variables.projectId), context.previousBoard);
      }
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: boardKey(variables.projectId) });
    },
  });
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  columnId?: string;
  assigneeIds?: string[];
  completed?: boolean;
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { taskId: string; updates: UpdateTaskPayload }) => {
      const res = await api.patch<{ data: Task }>(`/projects/${projectId}/tasks/${data.taskId}`, data.updates);
      return res.data.data;
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: boardKey(projectId) });
      const previousBoard = qc.getQueryData<BoardData>(boardKey(projectId));
      qc.setQueryData<BoardData>(boardKey(projectId), (board) => updateBoard(board, (current) => ({
        ...current, project: { ...current.project, columns: current.project.columns.map((column) => ({
          ...column, tasks: column.tasks.map((task) => task.id === variables.taskId ? { ...task, ...variables.updates } : task),
        })) },
      })));
      return { previousBoard };
    },
    onError: (_, _variables, context) => {
      if (context?.previousBoard) {
        qc.setQueryData<BoardData>(boardKey(projectId), context.previousBoard);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardKey(projectId) });
    },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      return res.data;
    },
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: boardKey(projectId) });
      const previousBoard = qc.getQueryData<BoardData>(boardKey(projectId));
      qc.setQueryData<BoardData>(boardKey(projectId), (board) => updateBoard(board, (current) => ({
        ...current, project: { ...current.project, columns: current.project.columns.map((column) => ({ ...column, tasks: column.tasks.filter((task) => task.id !== taskId) })) },
      })));
      return { previousBoard };
    },
    onError: (_, _variables, context) => {
      if (context?.previousBoard) {
        qc.setQueryData<BoardData>(boardKey(projectId), context.previousBoard);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardKey(projectId) });
    },
  });
}

export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      taskId: string;
      sourceColumnId: string;
      targetColumnId: string;
      sourceIndex: number;
      targetIndex: number;
    }) => {
      const res = await api.post<{ data: Task }>(`/projects/${projectId}/columns/${data.sourceColumnId}/move`, data);
      return res.data.data;
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: boardKey(projectId) });
      const previousBoard = qc.getQueryData<BoardData>(boardKey(projectId));
      qc.setQueryData<BoardData>(boardKey(projectId), (board) => updateBoard(board, (current) => {
        const moved = current.project.columns.flatMap((column) => column.tasks).find((task) => task.id === variables.taskId);
        if (!moved) return current;
        return { ...current, project: { ...current.project, columns: current.project.columns.map((column) => {
          const tasks = column.tasks.filter((task) => task.id !== variables.taskId);
          if (column.id === variables.targetColumnId) tasks.splice(variables.targetIndex, 0, { ...moved, columnId: column.id });
          return { ...column, tasks };
        }) } };
      }));
      return { previousBoard };
    },
    onError: (_, _variables, context) => {
      if (context?.previousBoard) {
        qc.setQueryData<BoardData>(boardKey(projectId), context.previousBoard);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardKey(projectId) });
    },
  });
}

export function useComments(projectId: string, taskId: string | undefined) {
  return useQuery({
    queryKey: ['comments', projectId, taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const res = await api.get<{ data: Task }>(`/projects/${projectId}/tasks/${taskId}`);
      return res.data.data.comments ?? ([] as Comment[]);
    },
  });
}

export function useAddComment(projectId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<{ data: Comment }>(`/projects/${projectId}/tasks/${taskId}/comments`, { body });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useActivities(projectId: string) {
  return useQuery({
    queryKey: ['activities', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await api.get<{ data: Activity[] }>(`/projects/${projectId}/activities`);
      return res.data.data;
    },
  });
}

const chatKey = (projectId: string) => ['chat', projectId] as const;

export function useProjectChat(projectId: string) {
  return useQuery({
    queryKey: chatKey(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<ChatGroup | null> => {
      const res = await api.get<{ data: ChatGroup | null }>(`/projects/${projectId}/chat`);
      const group = res.data.data;
      if (!group) return null;
      // Server returns the newest 50 messages first; show them oldest-to-newest.
      return { ...group, messages: [...group.messages].reverse() };
    },
  });
}

export function useSendChatMessage(projectId: string, currentUser: User | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<{ data: ChatMessage }>(`/projects/${projectId}/chat/messages`, { body });
      return res.data.data;
    },
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: chatKey(projectId) });
      const previous = qc.getQueryData<ChatGroup | null>(chatKey(projectId));
      if (previous && currentUser) {
        const optimistic: ChatMessage = {
          id: `tmp-${uuid()}`,
          groupId: previous.id,
          senderId: currentUser.id,
          body,
          createdAt: new Date().toISOString(),
          sender: currentUser,
        };
        qc.setQueryData<ChatGroup | null>(chatKey(projectId), (old) =>
          old ? { ...old, messages: [...old.messages, optimistic] } : old
        );
      }
      return { previous };
    },
    onError: (_, _body, context) => {
      if (context?.previous != null) {
        qc.setQueryData<ChatGroup | null>(chatKey(projectId), context.previous);
      }
    },
    onSettled: () => {
      // The socket event refetches too; this covers the acting client.
      void qc.invalidateQueries({ queryKey: chatKey(projectId) });
    },
  });
}

/* ===== Task 2.4: New hooks for columns, members, projects, comments ===== */

export function useCreateColumn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post<{ data: { id: string } }>(`/projects/${projectId}/columns`, { name });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useUpdateColumn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { columnId: string; name: string }) => {
      const res = await api.patch(`/projects/${projectId}/columns/${data.columnId}`, { name: data.name });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useDeleteColumn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (columnId: string) => {
      const res = await api.delete(`/projects/${projectId}/columns/${columnId}`);
      return res.data;
    },
    onMutate: async (columnId) => {
      await qc.cancelQueries({ queryKey: boardKey(projectId) });
      const previousBoard = qc.getQueryData<BoardData>(boardKey(projectId));
      // Mirror the server: the column disappears immediately and its tasks
      // join the first remaining column (by position) at the end.
      qc.setQueryData<BoardData>(boardKey(projectId), (board) => updateBoard(board, (current) => {
        const removed = current.project.columns.filter((column) => column.id !== columnId);
        const fallback = removed[0];
        if (!fallback) return current;
        const moved = current.project.columns.find((column) => column.id === columnId)?.tasks ?? [];
        return {
          ...current,
          project: {
            ...current.project,
            columns: removed.map((column, index) =>
              index === 0 ? { ...column, tasks: [...column.tasks, ...moved] } : column
            ),
          },
        };
      }));
      return { previousBoard };
    },
    onError: (_, _columnId, context) => {
      if (context?.previousBoard) {
        qc.setQueryData<BoardData>(boardKey(projectId), context.previousBoard);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardKey(projectId) });
    },
  });
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; role: Role }) => {
      const res = await api.post(`/projects/${projectId}/members`, data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.delete(`/projects/${projectId}/members/${userId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useUpdateProject(projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { projectId?: string; name?: string; description?: string | null; color?: string }) => {
      const id = data.projectId ?? projectId;
      if (!id) throw new Error('Project id is required');
      const res = await api.patch(`/projects/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_result, variables) => {
      const id = variables.projectId ?? projectId;
      if (!id) return;
      qc.invalidateQueries({ queryKey: ['board', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const res = await api.delete(`/projects/${projectId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteComment(projectId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await api.delete(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useExportSheets(projectId: string) {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const res = await api.get<{ data: { url: string } }>(`/projects/${projectId}/export/sheets`);
      return res.data.data.url;
    },
  });
}

export function useExportCsv(projectId: string) {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const res = await api.get<string>(`/projects/${projectId}/export/csv`, { responseType: 'text' });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },
  });
}

export function useExportTxt(projectId: string) {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const res = await api.get<string>(`/projects/${projectId}/export/txt`, { responseType: 'text' });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },
  });
}

/** Vietnamese progress report (GET /projects/:id/export/progress). */
export function useExportProgress(projectId: string) {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const res = await api.get<string>(`/projects/${projectId}/export/progress`, { responseType: 'text' });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },
  });
}

/** Cross-project recent activities for the dashboard feed (GET /api/activities). */
export function useRecentActivities(limit = 12) {
  return useQuery({
    queryKey: ['activities', 'recent', limit],
    queryFn: async () => {
      const res = await api.get<{ data: (Activity & { projectName: string })[] }>(
        `/activities?limit=${limit}`
      );
      return res.data.data;
    },
  });
}
