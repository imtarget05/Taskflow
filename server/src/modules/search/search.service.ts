import { prisma } from '../../lib/prisma';

export async function searchTasks(userId: string, q: string, limit = 10) {
  return prisma.task.findMany({
    where: {
      title: { contains: q, mode: 'insensitive' },
      project: { members: { some: { userId } } },
    },
    take: limit,
    select: {
      id: true,
      title: true,
      completed: true,
      projectId: true,
      project: { select: { name: true, color: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}