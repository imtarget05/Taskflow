import { Role } from '@prisma/client';
import { createProject, assertRole } from '../project.service';
import { AppError } from '../../../utils/errors';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    project: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    column: {
      createMany: jest.fn(),
    },
    projectMember: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    chatGroup: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    chatGroupMember: {
      upsert: jest.fn(),
    },
    activity: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/socket', () => ({
  emitToProject: jest.fn(),
  SOCKET_EVENTS: {},
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  project: { create: jest.Mock; findUnique: jest.Mock };
  column: { createMany: jest.Mock };
  projectMember: { create: jest.Mock; findUnique: jest.Mock };
  chatGroup: { findUnique: jest.Mock; create: jest.Mock };
  chatGroupMember: { upsert: jest.Mock };
  activity: { create: jest.Mock };
};

describe('project.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createProject', () => {
    it('creates the project, default columns, owner membership and project chat', async () => {
      mockedPrisma.project.create.mockResolvedValue({ id: 'p1' });
      mockedPrisma.column.createMany.mockResolvedValue({ count: 3 });
      mockedPrisma.projectMember.create.mockResolvedValue({});
      mockedPrisma.chatGroup.findUnique.mockResolvedValue(null);
      mockedPrisma.project.findUnique.mockResolvedValue({ name: 'My Project' });
      mockedPrisma.chatGroup.create.mockResolvedValue({ id: 'g1' });
      mockedPrisma.chatGroupMember.upsert.mockResolvedValue({});

      const result = await createProject('u1', { name: 'My Project' });

      expect(result).toEqual({ id: 'p1' });
      expect(mockedPrisma.column.createMany).toHaveBeenCalledWith({
        data: [
          { projectId: 'p1', name: 'To Do', position: 0 },
          { projectId: 'p1', name: 'In Progress', position: 1 },
          { projectId: 'p1', name: 'Done', position: 2 },
        ],
      });
      expect(mockedPrisma.projectMember.create).toHaveBeenCalledWith({
        data: { projectId: 'p1', userId: 'u1', role: Role.OWNER },
      });
      expect(mockedPrisma.chatGroup.create).toHaveBeenCalledWith({
        data: { projectId: 'p1', name: '#My Project' },
      });
      expect(mockedPrisma.chatGroupMember.upsert).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId: 'g1', userId: 'u1' } },
        create: { groupId: 'g1', userId: 'u1' },
        update: {},
      });
    });
  });

  describe('assertRole', () => {
    it('returns the membership role when role is sufficient', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: Role.OWNER });
      const result = await assertRole('p1', 'u1', Role.MEMBER);
      expect(result).toEqual({ role: Role.OWNER });
    });

    it('throws 403 for non-members', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(assertRole('p1', 'u1', Role.VIEWER)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 403 when the role rank is too low', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: Role.VIEWER });
      await expect(assertRole('p1', 'u1', Role.MEMBER)).rejects.toBeInstanceOf(AppError);
    });
  });
});