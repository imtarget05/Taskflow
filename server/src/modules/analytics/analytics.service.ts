import { TaskPriority, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { assertRole } from '../project/project.service';

export interface OverviewStats {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  byPriority: Record<TaskPriority, number>;
  byProject: { projectId: string; name: string; color: string | null; total: number; completed: number }[];
}

/** Aggregated LLM spend for the cost dashboard (per-user or per-project "team"). */
export interface LlmCostStats {
  currency: 'USD';
  days: number;
  scope: 'user' | 'project';
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byModel: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
  }[];
}

const MAX_COST_DAYS = 365;

/**
 * Aggregate AIUsage rows for a user (default) or a whole project team
 * (`projectId` — requires project membership, VIEWER+).
 * Read-only; never mutates. `days` is clamped to [1, 365].
 */
export async function getLlmCost(
  userId: string,
  opts: { projectId?: string; model?: string; days?: number } = {}
): Promise<LlmCostStats> {
  const days = Math.min(MAX_COST_DAYS, Math.max(1, Math.trunc(opts.days ?? 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  if (opts.projectId) {
    // Team view — any project member (VIEWER+) may inspect project spend.
    await assertRole(opts.projectId, userId, Role.VIEWER);
  }

  const where = {
    createdAt: { gte: since },
    ...(opts.projectId ? { projectId: opts.projectId } : { userId }),
    ...(opts.model ? { model: opts.model } : {}),
  };

  const rows = await prisma.aIUsage.groupBy({
    by: ['model'],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      inputCostUsd: true,
      outputCostUsd: true,
      totalCostUsd: true,
    },
    _count: { _all: true },
    orderBy: { _sum: { totalCostUsd: 'desc' } },
  });

  const round = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
  const byModel = rows.map((r) => ({
    model: r.model,
    inputTokens: r._sum.inputTokens ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
    inputCostUsd: round(r._sum.inputCostUsd ?? 0),
    outputCostUsd: round(r._sum.outputCostUsd ?? 0),
    totalCostUsd: round(r._sum.totalCostUsd ?? 0),
  }));

  return {
    currency: 'USD',
    days,
    scope: opts.projectId ? 'project' : 'user',
    totalCostUsd: round(byModel.reduce((acc, m) => acc + m.totalCostUsd, 0)),
    totalInputTokens: byModel.reduce((acc, m) => acc + m.inputTokens, 0),
    totalOutputTokens: byModel.reduce((acc, m) => acc + m.outputTokens, 0),
    totalCalls: rows.reduce((acc, r) => acc + (r._count._all ?? 0), 0),
    byModel,
  };
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