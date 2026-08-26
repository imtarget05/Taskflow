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

export interface NlpStatsRow {
  category: string;
  total: number;
  applied: number;
  ignored: number;
  applyRate: number;
}

export interface NlpStats {
  byCategory: NlpStatsRow[];
  confidenceBuckets: { bucket: string; count: number }[];
  totalFeedback: number;
  overallApplyRate: number;
}

export type NlpDecision = 'applied' | 'ignored';

/** Implicit feedback: a 1-click apply is a positive label; viewing without
 * applying is treated as "ignored" (the silent-eval signal). */
export function useNlpFeedback() {
  return useMutation({
    mutationFn: async (payload: {
      analysisId: string;
      category: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      decision: NlpDecision;
    }): Promise<void> => {
      await api.post('/nlp/feedback', payload);
    },
  });
}

/** Aggregate apply rates + confidence distribution for the current user. */
export function useNlpStats() {
  return useQuery({
    queryKey: ['nlp', 'stats'],
    queryFn: async () => {
      const res = await api.get<{ data: NlpStats }>('/nlp/stats');
      return res.data.data;
    },
  });
}
