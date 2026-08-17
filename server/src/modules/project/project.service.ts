import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { AppError } from '../../utils/errors';

export async function createProject(
  ownerId: string,
  data: { name: string; description?: string; color?: string }
): Promise<{ id: string }> {
  const project = await prisma.project.create({
    data: {
      name: data.name.trim(),
      description: data.description,
      color: data.color,
      ownerId,
    },
  });

  // Create default kanban columns.
  const defaults = ['To Do', 'In Progress', 'Done'];
  await prisma.column.createMany({
    data: defaults.map((name, i) => ({ projectId: project.id, name, position: i })),
  });

  // Owner is also a member with OWNER role.
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: ownerId, role: Role.OWNER },
  });

  return { id: project.id };
}

export async function listProjects(userId: string) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { createdAt: 'desc' },
  });
  return memberships.map((m) => m.project);
}

export async function getProject(projectId: string, userId: string) {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) {
    throw new AppError('Not a member of this project', 403);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: { orderBy: { position: 'asc' }, include: { tasks: { orderBy: { position: 'asc' } } } },
      members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
    },
  });
  return { project, role: membership.role };
}

export async function updateProject(
  projectId: string,
  userId: string,
  data: { name?: string; description?: string; color?: string }
): Promise<{ id: string }> {
  await assertRole(projectId, userId, Role.MEMBER);
  await prisma.project.update({ where: { id: projectId }, data });
  return { id: projectId };
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  await assertRole(projectId, userId, Role.OWNER);
  await prisma.project.delete({ where: { id: projectId } });
}

export async function addMember(
  projectId: string,
  actorId: string,
  data: { email: string; role: Role }
): Promise<void> {
  await assertRole(projectId, actorId, Role.OWNER);

  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase().trim() } });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: user.id } },
    create: { projectId, userId: user.id, role: data.role },
    update: { role: data.role },
  });

  emitToProject(projectId, SOCKET_EVENTS.MEMBER_ADDED, { userId: user.id, role: data.role });
}

export async function removeMember(
  projectId: string,
  actorId: string,
  targetUserId: string
): Promise<void> {
  await assertRole(projectId, actorId, Role.OWNER);
  if (actorId === targetUserId) {
    throw new AppError('Owner cannot remove themselves', 400);
  }
  await prisma.projectMember.deleteMany({
    where: { projectId, userId: targetUserId },
  });
  emitToProject(projectId, SOCKET_EVENTS.MEMBER_REMOVED, { userId: targetUserId });
}

export async function listMembers(projectId: string, userId: string) {
  await assertRole(projectId, userId, Role.VIEWER);
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((m) => ({ role: m.role, ...m.user }));
}

/** Internal helper to assert a minimum role and return the membership. */
export async function assertRole(
  projectId: string,
  userId: string,
  minRole: Role
): Promise<{ role: Role }> {
  const ROLE_RANK: Record<Role, number> = { OWNER: 3, MEMBER: 2, VIEWER: 1 };
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) {
    throw new AppError('Not a member of this project', 403);
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AppError(`Requires at least ${minRole} role`, 403);
  }
  return { role: membership.role };
}