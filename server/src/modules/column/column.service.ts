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

    // Move every task to the fallback column in a single statement instead of
    // one update per task, preserving relative order: each moved task receives
    // start_pos + row_number, so positions stay contiguous. The raw write also
    // avoids touching updatedAt for tasks that were merely relocated.
    await tx.$executeRaw`
      WITH fallback AS (
        SELECT COALESCE(MAX("position"), -1) + 1 AS start_pos FROM "tasks" WHERE "columnId" = ${fallback.id}
      ),
      moved AS (
        SELECT id, row_number() OVER (ORDER BY "position" ASC) - 1 AS rn FROM "tasks" WHERE "columnId" = ${columnId}
      )
      UPDATE "tasks" t
      SET "columnId" = ${fallback.id},
          "position" = (SELECT start_pos FROM fallback) + m.rn
      FROM moved m
      WHERE t.id = m.id
    `;

    await tx.column.delete({ where: { id: columnId } });
    return { id: columnId };
  });
}
