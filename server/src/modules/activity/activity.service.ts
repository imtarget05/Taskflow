import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export function createActivity(
  projectId: string,
  userId: string,
  taskId: string | null,
  action: string,
  metadata?: Record<string, unknown>
) {
  return prisma.activity.create({
    data: { projectId, userId, taskId, action, metadata: (metadata as Prisma.InputJsonValue) ?? {} },
  });
}

export function listActivities(projectId: string) {
  return prisma.activity.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
