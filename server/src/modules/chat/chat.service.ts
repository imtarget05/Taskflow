import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';

/**
 * Chat groups: one auto-created group per project. Members are joined
 * automatically when they are added to the project (and on first read, to
 * heal any stale memberships).
 */

export async function ensureChatGroup(projectId: string): Promise<{ id: string }> {
  const existing = await prisma.chatGroup.findUnique({ where: { projectId } });
  if (existing) return existing;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) throw new AppError('Project not found', 404);

  try {
    return await prisma.chatGroup.create({
      data: { projectId, name: `#${project.name}` },
    });
  } catch {
    // Concurrent creation race: return the group another request just made.
    const raced = await prisma.chatGroup.findUnique({ where: { projectId } });
    if (raced) return raced;
    throw new AppError('Unable to create chat group', 500);
  }
}

export async function addChatGroupMember(groupId: string, userId: string): Promise<void> {
  await prisma.chatGroupMember.upsert({
    where: { groupId_userId: { groupId, userId } },
    create: { groupId, userId },
    update: {},
  });
}

export async function removeChatGroupMemberForProject(projectId: string, userId: string): Promise<void> {
  const group = await prisma.chatGroup.findUnique({ where: { projectId }, select: { id: true } });
  if (!group) return;
  await prisma.chatGroupMember.deleteMany({ where: { groupId: group.id, userId } });
}

async function assertMember(projectId: string, userId: string, minRole: Role): Promise<void> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) throw new AppError('Not a member of this project', 403);
  const levels: Record<Role, number> = { VIEWER: 0, MEMBER: 1, OWNER: 2 };
  if (levels[membership.role] < levels[minRole]) {
    throw new AppError(`Requires at least ${minRole} role`, 403);
  }
}

export async function getGroup(projectId: string, userId: string) {
  await assertMember(projectId, userId, Role.VIEWER);

  const group = await ensureChatGroup(projectId);
  await addChatGroupMember(group.id, userId);

  return prisma.chatGroup.findUnique({
    where: { id: group.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      // Last 50 messages, oldest first.
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
}

export async function sendMessage(projectId: string, userId: string, body: string) {
  await assertMember(projectId, userId, Role.MEMBER);

  const group = await ensureChatGroup(projectId);
  return prisma.chatMessage.create({
    data: { groupId: group.id, senderId: userId, body: body.trim() },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
}