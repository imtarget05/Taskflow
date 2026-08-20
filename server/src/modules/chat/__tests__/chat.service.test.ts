import { Role } from '@prisma/client';
import { ensureChatGroup, getGroup, sendMessage } from '../chat.service';
import { AppError } from '../../../utils/errors';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    chatGroupMember: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  chatGroup: { findUnique: jest.Mock; create: jest.Mock };
  project: { findUnique: jest.Mock };
  chatGroupMember: { upsert: jest.Mock; deleteMany: jest.Mock };
  projectMember: { findUnique: jest.Mock };
  chatMessage: { create: jest.Mock };
};

describe('chat.service', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('ensureChatGroup', () => {
    it('returns the existing group', async () => {
      mockedPrisma.chatGroup.findUnique.mockResolvedValue({ id: 'g1', name: '#p' });
      const group = await ensureChatGroup('p1');
      expect(group).toEqual({ id: 'g1', name: '#p' });
      expect(mockedPrisma.chatGroup.create).not.toHaveBeenCalled();
    });

    it('creates the group when missing', async () => {
      mockedPrisma.chatGroup.findUnique.mockResolvedValue(null);
      mockedPrisma.project.findUnique.mockResolvedValue({ name: 'Website' });
      mockedPrisma.chatGroup.create.mockResolvedValue({ id: 'g1' });

      const group = await ensureChatGroup('p1');

      expect(mockedPrisma.chatGroup.create).toHaveBeenCalledWith({
        data: { projectId: 'p1', name: '#Website' },
      });
      expect(group).toEqual({ id: 'g1' });
    });

    it('returns the raced group when creation fails concurrently', async () => {
      mockedPrisma.chatGroup.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'g2' });
      mockedPrisma.project.findUnique.mockResolvedValue({ name: 'Website' });
      mockedPrisma.chatGroup.create.mockRejectedValue(new Error('unique violation'));

      const group = await ensureChatGroup('p1');

      expect(group).toEqual({ id: 'g2' });
    });
  });

  describe('getGroup', () => {
    it('joins the member and returns the group with messages', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: Role.VIEWER });
      mockedPrisma.chatGroup.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'g1',
          name: '#p',
          members: [{ user: { id: 'u1', name: 'A' } }],
          messages: [{ id: 'm1', body: 'hi' }],
        });
      mockedPrisma.project.findUnique.mockResolvedValue({ name: 'p' });
      mockedPrisma.chatGroup.create.mockResolvedValue({ id: 'g1' });
      mockedPrisma.chatGroupMember.upsert.mockResolvedValue({});

      const group = await getGroup('p1', 'u1');

      expect(mockedPrisma.chatGroupMember.upsert).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId: 'g1', userId: 'u1' } },
        create: { groupId: 'g1', userId: 'u1' },
        update: {},
      });
      expect(group).toMatchObject({ id: 'g1' });
    });

    it('throws 403 for non-members', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(getGroup('p1', 'u1')).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('sendMessage', () => {
    it('requires MEMBER role', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: Role.VIEWER });
      await expect(sendMessage('p1', 'u1', 'hello')).rejects.toBeInstanceOf(AppError);
    });

    it('creates the message with the sender', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: Role.MEMBER });
      mockedPrisma.chatGroup.findUnique.mockResolvedValue({ id: 'g1' });
      mockedPrisma.chatMessage.create.mockResolvedValue({ id: 'm1' });

      const message = await sendMessage('p1', 'u1', 'hello world');

      expect(mockedPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: { groupId: 'g1', senderId: 'u1', body: 'hello world' },
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      });
      expect(message).toEqual({ id: 'm1' });
    });
  });
});