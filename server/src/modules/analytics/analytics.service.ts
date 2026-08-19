import { TaskPriority } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface OverviewStats {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  byPriority: Record<TaskPriority, number>;
  byProject: { projectId: string; name: string; color: string | null; total: number; completed: number }[];
}

export async function getOverview(userId: string): Promise<OverviewStats> {
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { tasks: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const tasks = await prisma.task.findMany({
    where: { project: { members: { some: { userId } } } },
    select: { id: true, projectId: true, completed: true, priority: true, dueDate: true },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const byPriority: Record<TaskPriority, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };

  let completedTasks = 0;
  let overdueTasks = 0;
  const byProjectCounts = new Map<string, { total: number; completed: number }>();
  for (const task of tasks) {
    byPriority[task.priority] += 1;
    const entry = byProjectCounts.get(task.projectId) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (task.completed) {
      completedTasks += 1;
      entry.completed += 1;
    }
    if (task.dueDate && task.dueDate.getTime() < today.getTime() && !task.completed) overdueTasks += 1;
    byProjectCounts.set(task.projectId, entry);
  }

  return {
    totalProjects: projects.length,
    totalTasks: tasks.length,
    completedTasks,
    overdueTasks,
    byPriority,
    byProject: projects.map((p) => ({
      projectId: p.id,
      name: p.name,
      color: p.color,
      total: byProjectCounts.get(p.id)?.total ?? 0,
      completed: byProjectCounts.get(p.id)?.completed ?? 0,
    })),
  };
}