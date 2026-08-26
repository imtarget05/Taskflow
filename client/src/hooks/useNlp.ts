import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface TicketClassification {
  category: string;
  categoryConfidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  priorityConfidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: boolean;
  language: string;
  keywords: string[];
}

export interface AnalyseResponse extends TicketClassification {
  id: string;
  textLength: number;
  duplicateOf: string | null;
  duplicateScore: number | null;
  createdAt: string;
}

export interface AnalysePayload {
  text: string;
  projectId?: string | null;
  taskId?: string | null;
  candidates?: string[];
}

const analysesKey = ['nlp', 'analyses'];

export function useAnalyseText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AnalysePayload): Promise<AnalyseResponse> => {
      const res = await api.post<{ data: AnalyseResponse }>('/nlp/analyse', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: analysesKey }),
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: analysesKey,
    queryFn: async () => {
      const res = await api.get<{ data: AnalyseResponse[] }>('/nlp');
      return res.data.data;
    },
  });
}
