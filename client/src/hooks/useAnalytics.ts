import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { TaskPriority } from '@/types';

export interface OverviewStats {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  byPriority: Record<TaskPriority, number>;
  byProject: { projectId: string; name: string; color: string | null; total: number; completed: number }[];
}

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const res = await api.get<{ data: OverviewStats }>('/analytics/overview');
      return res.data.data;
    },
    refetchInterval: 60000,
  });
}