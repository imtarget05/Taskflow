import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ─── Prompts ─────────────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  name: string;
  version: string;
  content: string;
  variables: string[];
  isActive: boolean;
  metrics?: Record<string, unknown> | null;
  createdAt: string;
}

export interface PromptExperiment {
  id: string;
  name: string;
  promptName: string;
  variantA: string;
  variantB: string;
  trafficSplit: number;
  status: string;
  winner?: string | null;
  resultsA?: Record<string, unknown> | null;
  resultsB?: Record<string, unknown> | null;
  endedAt?: string | null;
  createdAt: string;
}

export function usePrompts() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: async (): Promise<PromptTemplate[]> => {
      const res = await api.get<{ data: PromptTemplate[] }>('/prompts');
      return res.data.data;
    },
  });
}

export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string; version: string; content: string;
      variables?: string[]; isActive?: boolean;
    }): Promise<PromptTemplate> => {
      const res = await api.post<{ data: PromptTemplate }>('/prompts', { variables: [], isActive: false, ...data });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompts'] }),
  });
}

export function useActivatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, version }: { name: string; version: string }): Promise<PromptTemplate> => {
      const res = await api.put<{ data: PromptTemplate }>(`/prompts/${name}/activate`, { name, version });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompts'] }),
  });
}

export function usePromptExperiments(promptName?: string) {
  return useQuery({
    queryKey: ['prompts', 'experiments', promptName],
    queryFn: async (): Promise<PromptExperiment[]> => {
      const res = await api.get<{ data: PromptExperiment[] }>('/prompts/experiments', {
        params: promptName ? { promptName } : undefined,
      });
      return res.data.data;
    },
  });
}

export function useCreatePromptExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string; promptName: string; variantA: string; variantB: string;
      trafficSplit?: number;
    }): Promise<PromptExperiment> => {
      const res = await api.post<{ data: PromptExperiment }>('/prompts/experiments', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompts', 'experiments'] }),
  });
}

export function useAnalyzePromptExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<PromptExperiment> => {
      const res = await api.get<{ data: PromptExperiment }>(`/prompts/experiments/${id}/analyze`);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompts', 'experiments'] }),
  });
}

// ─── MLOps Experiments ───────────────────────────────────────────

export interface MLOpsExperiment {
  id: string;
  name: string;
  description?: string | null;
  config: Record<string, unknown>;
  datasetSize: number;
  status: string;
  metrics?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export function useMLOpsExperiments() {
  return useQuery({
    queryKey: ['mlops', 'experiments'],
    queryFn: async (): Promise<MLOpsExperiment[]> => {
      const res = await api.get<{ data: MLOpsExperiment[] }>('/mlops/experiments');
      return res.data.data;
    },
  });
}

export function useCreateMLOpsExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string; description?: string; config: Record<string, unknown>;
      datasetSize?: number;
    }): Promise<MLOpsExperiment> => {
      const res = await api.post<{ data: MLOpsExperiment }>('/mlops/experiments', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mlops'] }),
  });
}

export function useRecordMLOpsMetrics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, metrics }: { id: string; metrics: Record<string, number> }): Promise<MLOpsExperiment> => {
      const res = await api.put<{ data: MLOpsExperiment }>(`/mlops/experiments/${id}/metrics`, metrics);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mlops'] }),
  });
}

// ─── Evaluation ───────────────────────────────────────────────────

export interface EvaluationRun {
  id: string;
  name: string;
  promptVersion?: string | null;
  datasetSize: number;
  metrics: Record<string, number>;
  config?: Record<string, unknown> | null;
  createdAt: string;
}

export function useEvaluationHistory() {
  return useQuery({
    queryKey: ['evaluation', 'history'],
    queryFn: async (): Promise<EvaluationRun[]> => {
      const res = await api.get<{ runs: EvaluationRun[] }>('/evaluation/history');
      return res.data.runs;
    },
  });
}

export function useRunEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      items: { question: string; answer?: string; context: string[]; accuracy?: number }[];
      config?: Record<string, unknown>;
    }): Promise<unknown> => {
      const res = await api.post('/evaluation/run', data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluation', 'history'] }),
  });
}