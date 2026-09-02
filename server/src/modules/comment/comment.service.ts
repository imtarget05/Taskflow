import { prisma } from '../../lib/prisma';
import { escapeHtml } from '../../utils/sanitize';

export function createComment(taskId: string, authorId: string, body: string) {
  return prisma.comment.create({
    data: { taskId, authorId, body: escapeHtml(body.trim()) },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export function deleteComment(id: string) {
  return prisma.comment.delete({ where: { id } });
}
