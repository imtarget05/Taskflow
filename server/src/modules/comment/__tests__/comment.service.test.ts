import { createComment, deleteComment } from '../comment.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    comment: {
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  comment: { create: jest.Mock; delete: jest.Mock };
};

describe('comment.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createComment', () => {
    it('creates a trimmed comment with the author included', async () => {
      mockedPrisma.comment.create.mockResolvedValue({ id: 'cm1' });

      const result = await createComment('t1', 'u1', '  Hello there  ');

      expect(mockedPrisma.comment.create).toHaveBeenCalledWith({
        data: { taskId: 't1', authorId: 'u1', body: 'Hello there' },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      });
      expect(result).toEqual({ id: 'cm1' });
    });
  });

  describe('deleteComment', () => {
    it('deletes the comment by id', async () => {
      mockedPrisma.comment.delete.mockResolvedValue({ id: 'cm1' });

      const result = await deleteComment('cm1');

      expect(mockedPrisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'cm1' } });
      expect(result).toEqual({ id: 'cm1' });
    });
  });
});