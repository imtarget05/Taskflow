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