import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  TaskRecommendation,
  RecommendationWeights,
  RecommendationStats,
  UserSkill,
  UserAvailability,
} from '@/types';

const recommendationsKey = ['recommendations'];
const configKey = ['recommendations', 'config'];
const statsKey = ['recommendations', 'stats'];
const skillsKey = ['users', 'me', 'skills'];
const availabilityKey = ['users', 'me', 'availability'];

export function useRecommendations() {
  return useQuery({
    queryKey: recommendationsKey,
    queryFn: async () => {
      const res = await api.get<{ data: TaskRecommendation[] }>('/recommendations/me');
      return res.data.data;
    },
  });
}

export function useRefreshRecommendations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: TaskRecommendation[] }>('/recommendations/refresh');
      return res.data.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(recommendationsKey, data);
    },
  });
}

export function useAcceptRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/recommendations/${id}/accept`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recommendationsKey });
      qc.invalidateQueries({ queryKey: statsKey });
    },
  });
}

export function useDismissRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/recommendations/${id}/dismiss`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recommendationsKey });
      qc.invalidateQueries({ queryKey: statsKey });
    },
  });
}

export function useRecommendationConfig() {
  return useQuery({
    queryKey: configKey,
    queryFn: async () => {
      const res = await api.get<{ data: RecommendationWeights }>('/recommendations/config');
      return res.data.data;
    },
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weights: RecommendationWeights) => {
      const res = await api.put<{ data: RecommendationWeights }>('/recommendations/config', weights);
      return res.data.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(configKey, data);
    },
  });
}

export function useRecommendationStats() {
  return useQuery({
    queryKey: statsKey,
    queryFn: async () => {
      const res = await api.get<{ data: RecommendationStats }>('/recommendations/stats');
      return res.data.data;
    },
    refetchInterval: 60000,
  });
}

export function useUserSkills() {
  return useQuery({
    queryKey: skillsKey,
    queryFn: async () => {
      const res = await api.get<{ data: UserSkill[] }>('/users/me/skills');
      return res.data.data;
    },
  });
}

export function useUpdateUserSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skills: { skill: string; level: number }[]) => {
      await api.put('/users/me/skills', { skills });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillsKey });
    },
  });
}

export function useUserAvailability() {
  return useQuery({
    queryKey: availabilityKey,
    queryFn: async () => {
      const res = await api.get<{ data: UserAvailability[] }>('/users/me/availability');
      return res.data.data;
    },
  });
}

export function useUpdateUserAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (availability: { dayOfWeek: number; morning: boolean; afternoon: boolean; evening: boolean }[]) => {
      await api.put('/users/me/availability', availability);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: availabilityKey });
    },
  });
}
