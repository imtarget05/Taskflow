import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ─── RAG ─────────────────────────────────────────────────────────

export interface RagResult {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

export interface RagSearchResponse {
  query: string;
  results: RagResult[];
}

export function useRagSearch(q: string, projectId?: string, enabled = false) {
  return useQuery({
    queryKey: ['rag', 'search', q, projectId],
    enabled: enabled && q.trim().length > 0,
    queryFn: async (): Promise<RagResult[]> => {
      const res = await api.get<{ data: RagSearchResponse }>('/rag/search', {
        params: { q, projectId: projectId || undefined, topK: 10 },
      });
      return res.data.data.results;
    },
  });
}

export function useRagIndex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<{ projectId: string; indexed: number }> => {
      const res = await api.post<{ data: { projectId: string; indexed: number } }>(`/rag/index/${projectId}`);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag'] });
    },
  });
}

// ─── MOdel Combine status endpoints ─────────────────────────────

export interface ModelStatus {
  running: boolean;
  activeModel: string | undefined;
  modelValid: boolean;
}

export interface OllamaModelView {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
}

export function useModelStatus() {
  return useQuery({
    queryKey: ['models', 'status'],
    queryFn: async (): Promise<ModelStatus> => {
      const res = await api.get<{ data: ModelStatus }>('/models/status');
      return res.data.data;
    },
  });
}

export function useListModels() {
  return useQuery({
    queryKey: ['models', 'list'],
    queryFn: async (): Promise<OllamaModelView[]> => {
      const res = await api.get<{ data: { models: OllamaModelView[] } }>('/models');
      return res.data.data.models;
    },
    refetchInterval: 15000,
  });
}

export function usePullModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<void> => {
      await api.post('/models/pull', { name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<void> => {
      await api.delete(`/models/${encodeURIComponent(name)}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
    },
  });
}