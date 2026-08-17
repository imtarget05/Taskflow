import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Activity, BoardData, Comment, Project, Task, TaskPriority } from '@/types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<{ data: Project[] }>('/projects');
      return res.data.data;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; color?: string }) => {
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
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['board', variables.projectId] }),
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { taskId: string; updates: Record<string, unknown> }) => {
      const res = await api.patch<{ data: Task }>(
        `/projects/${projectId}/tasks/${data.taskId}`,
        data.updates
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      sourceColumnId: string;
      targetColumnId: string;
      sourceIndex: number;
      targetIndex: number;
    }) => {
      const { projectId, ...move } = data;
      const res = await api.post(`/projects/${projectId}/columns/${move.sourceColumnId}/move`, move);
      return res.data;
    },
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['board', variables.projectId] }),
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
      const res = await api.post<{ data: Comment }>(
        `/projects/${projectId}/tasks/${taskId}/comments`,
        { body }
      );
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
