import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';

export async function createColumn(projectId: string, name: string) {
  const max = await prisma.column.aggregate({ where: { projectId }, _max: { position: true } });
  return prisma.column.create({
    data: { projectId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });
}

export async function renameColumn(projectId: string, columnId: string, name: string) {
  const column = await prisma.column.findFirst({ where: { id: columnId, projectId } });
  if (!column) throw new AppError('Column not found', 404);
  return prisma.column.update({ where: { id: columnId }, data: { name: name.trim() } });
}

export async function deleteColumn(projectId: string, columnId: string) {
  return prisma.$transaction(async (tx) => {
    const column = await tx.column.findFirst({ where: { id: columnId, projectId } });
    if (!column) throw new AppError('Column not found', 404);
    const fallback = await tx.column.findFirst({
      where: { projectId, id: { not: columnId } },
      orderBy: { position: 'asc' },
    });
    if (!fallback) throw new AppError('A project must keep at least one column', 400);
    
    // Get tasks to move, ordered by position
    const tasksToMove = await tx.task.findMany({
      where: { columnId },
      orderBy: { position: 'asc' },
    });
    
    // Get current max position in fallback column
    const max = await tx.task.aggregate({ where: { columnId: fallback.id }, _max: { position: true } });
    let nextPos = (max._max.position ?? -1) + 1;
    
    // Move each task with sequential positions
    for (const task of tasksToMove) {
      await tx.task.update({
        where: { id: task.id },
        data: { columnId: fallback.id, position: nextPos },
      });
      nextPos++;
    }
    
    await tx.column.delete({ where: { id: columnId } });
    return { id: columnId };
  });
}
