import type { Task, TaskPriority } from '@/types';

export interface BoardFilters {
  priority: TaskPriority | 'ALL';
  assigneeId: string | 'ALL';
  showCompleted: boolean;
}

export const ALL_FILTERS: BoardFilters = { priority: 'ALL', assigneeId: 'ALL', showCompleted: true };

export function matchesFilters(task: Task, filters: BoardFilters): boolean {
  if (filters.priority !== 'ALL' && task.priority !== filters.priority) return false;
  if (filters.assigneeId !== 'ALL' && !task.assignments.some((a) => a.user.id === filters.assigneeId)) return false;
  if (!filters.showCompleted && task.completed) return false;
  return true;
}

export function isFiltering(filters: BoardFilters): boolean {
  return JSON.stringify(filters) !== JSON.stringify(ALL_FILTERS);
}