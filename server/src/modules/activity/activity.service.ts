import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';

export function createActivity(
  projectId: string,
  userId: string,
  taskId: string | null,
  action: string,
  metadata?: Record<string, unknown>
) {
  const record = prisma.activity.create({
    data: { projectId, userId, taskId, action, metadata: (metadata as Prisma.InputJsonValue) ?? {} },
  });
  // Every client in the project room (including the actor) refreshes its
  // activity feed in realtime.
  record.then(
    () => emitToProject(projectId, SOCKET_EVENTS.ACTIVITY_CREATED, { projectId }),
    () => {
      /* best effort: realtime refresh is not critical if the write failed */
    }
  );
  return record;
}

export function listActivities(projectId: string) {
  return prisma.activity.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/**
 * Recent activities across every project the user is a member of (dashboard
 * feed). Project-scoping happens via the member relation, so outsiders never
 * see other users' activity. Each row carries its project name for display.
 */
export async function listRecentActivities(userId: string, limit = 20) {
  return prisma.activity.findMany({
    where: { project: { members: { some: { userId } } } },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
  });
}