import { prisma } from '../../lib/prisma';

export function createComment(taskId: string, authorId: string, body: string) {
  return prisma.comment.create({
    data: { taskId, authorId, body: body.trim() },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export function deleteComment(id: string) {
  return prisma.comment.delete({ where: { id } });
}
