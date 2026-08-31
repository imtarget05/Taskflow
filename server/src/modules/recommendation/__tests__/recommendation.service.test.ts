import {
  getConfig,
  updateConfig,
  getUserSkills,
  updateUserSkills,
  getUserAvailability,
  updateUserAvailability,
  recommendForUser,
  refreshRecommendations,
  acceptRecommendation,
  dismissRecommendation,
  listRecommendations,
  getStats,
} from '../recommendation.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    recommendationConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userSkill: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    userAvailability: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    taskRecommendation: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
    taskAssignment: {
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedConfigFindUnique = prisma.recommendationConfig.findUnique as jest.Mock;
const mockedConfigUpsert = prisma.recommendationConfig.upsert as jest.Mock;
const mockedUserSkillFindMany = prisma.userSkill.findMany as jest.Mock;
const mockedUserSkillDeleteMany = prisma.userSkill.deleteMany as jest.Mock;
const mockedUserSkillCreateMany = prisma.userSkill.createMany as jest.Mock;
const mockedAvailabilityFindMany = prisma.userAvailability.findMany as jest.Mock;
const mockedAvailabilityDeleteMany = prisma.userAvailability.deleteMany as jest.Mock;
const mockedAvailabilityCreateMany = prisma.userAvailability.createMany as jest.Mock;
const mockedRecCreate = prisma.taskRecommendation.create as jest.Mock;
const mockedRecDeleteMany = prisma.taskRecommendation.deleteMany as jest.Mock;
const mockedRecFindUnique = prisma.taskRecommendation.findUnique as jest.Mock;
const mockedRecUpdate = prisma.taskRecommendation.update as jest.Mock;
const mockedRecFindMany = prisma.taskRecommendation.findMany as jest.Mock;
const mockedRecCount = prisma.taskRecommendation.count as jest.Mock;
const mockedRecAggregate = prisma.taskRecommendation.aggregate as jest.Mock;
const mockedTaskFindMany = prisma.task.findMany as jest.Mock;
const mockedAssignmentCount = prisma.taskAssignment.count as jest.Mock;
const mockedAssignmentFindUnique = prisma.taskAssignment.findUnique as jest.Mock;
const mockedAssignmentCreate = prisma.taskAssignment.create as jest.Mock;

describe('recommendation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('returns default weights when no config exists', async () => {
      mockedConfigFindUnique.mockResolvedValue(null);

      const config = await getConfig();

      expect(config.skillMatch).toBe(0.40);
      expect(config.availability).toBe(0.25);
      expect(config.priority).toBe(0.20);
      expect(config.history).toBe(0.10);
      expect(config.workloadBalance).toBe(0.05);
    });

    it('returns stored config when exists', async () => {
      mockedConfigFindUnique.mockResolvedValue({
        key: 'weights',
        value: { skillMatch: 0.5, availability: 0.2, priority: 0.15, history: 0.1, workloadBalance: 0.05 },
      });

      const config = await getConfig();

      expect(config.skillMatch).toBe(0.5);
      expect(config.availability).toBe(0.2);
    });
  });

  describe('updateConfig', () => {
    it('upserts new config', async () => {
      mockedConfigFindUnique.mockResolvedValue(null);
      mockedConfigUpsert.mockResolvedValue({
        key: 'weights',
        value: { skillMatch: 0.5 },
      });

      const result = await updateConfig({ skillMatch: 0.5 });

      expect(mockedConfigUpsert).toHaveBeenCalledTimes(1);
      expect(result.skillMatch).toBe(0.5);
    });
  });

  describe('getUserSkills', () => {
    it('returns user skills ordered by level desc', async () => {
      const skills = [
        { id: 's1', userId: 'u1', skill: 'react', level: 5 },
        { id: 's2', userId: 'u1', skill: 'nodejs', level: 3 },
      ];
      mockedUserSkillFindMany.mockResolvedValue(skills);

      const result = await getUserSkills('u1');

      expect(result).toEqual(skills);
      expect(mockedUserSkillFindMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { level: 'desc' },
      });
    });
  });

  describe('updateUserSkills', () => {
    it('deletes old skills and creates new ones', async () => {
      mockedUserSkillFindMany.mockResolvedValue([
        { id: 's1', userId: 'u1', skill: 'react', level: 5 },
      ]);

      await updateUserSkills('u1', [
        { skill: 'React', level: 4 },
        { skill: 'NodeJS', level: 3 },
      ]);

      expect(mockedUserSkillDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(mockedUserSkillCreateMany).toHaveBeenCalledTimes(1);
      expect(mockedUserSkillCreateMany.mock.calls[0][0].data).toHaveLength(2);
    });

    it('normalizes skill names to lowercase', async () => {
      mockedUserSkillFindMany.mockResolvedValue([]);

      await updateUserSkills('u1', [{ skill: 'REACT', level: 5 }]);

      expect(mockedUserSkillCreateMany.mock.calls[0][0].data[0].skill).toBe('react');
    });
  });

  describe('getUserAvailability', () => {
    it('returns availability ordered by dayOfWeek', async () => {
      const availability = [
        { id: 'a1', userId: 'u1', dayOfWeek: 1, morning: true, afternoon: true, evening: false },
      ];
      mockedAvailabilityFindMany.mockResolvedValue(availability);

      const result = await getUserAvailability('u1');

      expect(result).toEqual(availability);
    });
  });

  describe('updateUserAvailability', () => {
    it('deletes old availability and creates new', async () => {
      mockedAvailabilityFindMany.mockResolvedValue([]);

      await updateUserAvailability('u1', [
        { dayOfWeek: 1, morning: true, afternoon: true, evening: false },
      ]);

      expect(mockedAvailabilityDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(mockedAvailabilityCreateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('recommendForUser', () => {
    it('generates recommendations for matching tasks', async () => {
      mockedConfigFindUnique.mockResolvedValue(null);
      mockedUserSkillFindMany.mockResolvedValue([{ id: 's1', userId: 'u1', skill: 'react', level: 5 }]);
      mockedAvailabilityFindMany.mockResolvedValue([
        { id: 'a1', userId: 'u1', dayOfWeek: 1, morning: true, afternoon: true, evening: false },
      ]);
      mockedAssignmentCount.mockResolvedValue(2);
      mockedTaskFindMany.mockResolvedValue([
        {
          id: 't1',
          projectId: 'p1',
          title: 'Build React component',
          description: 'Create a new component',
          priority: 'HIGH',
          dueDate: null,
          project: { id: 'p1', name: 'Project 1' },
          assignments: [],
        },
      ]);
      mockedRecCreate.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        projectId: 'p1',
        taskId: 't1',
        score: 0.75,
        reason: 'Đề xuất vì kỹ năng phù hợp',
        factors: {},
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await recommendForUser('u1');

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('t1');
      expect(result[0].score).toBeGreaterThan(0);
    });

    it('returns empty array when no tasks available', async () => {
      mockedConfigFindUnique.mockResolvedValue(null);
      mockedUserSkillFindMany.mockResolvedValue([]);
      mockedAvailabilityFindMany.mockResolvedValue([]);
      mockedAssignmentCount.mockResolvedValue(0);
      mockedTaskFindMany.mockResolvedValue([]);

      const result = await recommendForUser('u1');

      expect(result).toEqual([]);
    });
  });

  describe('refreshRecommendations', () => {
    it('deletes old pending recommendations and creates new ones', async () => {
      mockedConfigFindUnique.mockResolvedValue(null);
      mockedUserSkillFindMany.mockResolvedValue([]);
      mockedAvailabilityFindMany.mockResolvedValue([]);
      mockedAssignmentCount.mockResolvedValue(0);
      mockedTaskFindMany.mockResolvedValue([]);
      mockedRecDeleteMany.mockResolvedValue({ count: 2 });

      await refreshRecommendations('u1');

      expect(mockedRecDeleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', status: 'pending' },
      });
    });
  });

  describe('acceptRecommendation', () => {
    it('accepts a pending recommendation', async () => {
      mockedRecFindUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        projectId: 'p1',
        taskId: 't1',
        status: 'pending',
      });
      mockedRecUpdate.mockResolvedValue({
        id: 'r1',
        status: 'accepted',
      });
      mockedAssignmentFindUnique.mockResolvedValue(null);
      mockedAssignmentCreate.mockResolvedValue({
        id: 'ta1',
        taskId: 't1',
        userId: 'u1',
      });

      const result = await acceptRecommendation('u1', 'r1', true);

      expect(result.status).toBe('accepted');
      expect(mockedAssignmentCreate).toHaveBeenCalledTimes(1);
    });

    it('throws 404 when recommendation not found', async () => {
      mockedRecFindUnique.mockResolvedValue(null);

      await expect(acceptRecommendation('u1', 'r1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 403 when recommendation belongs to another user', async () => {
      mockedRecFindUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u2',
        status: 'pending',
      });

      await expect(acceptRecommendation('u1', 'r1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws 400 when recommendation is not pending', async () => {
      mockedRecFindUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        status: 'accepted',
      });

      await expect(acceptRecommendation('u1', 'r1')).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('dismissRecommendation', () => {
    it('dismisses a pending recommendation', async () => {
      mockedRecFindUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        status: 'pending',
      });
      mockedRecUpdate.mockResolvedValue({
        id: 'r1',
        status: 'dismissed',
      });

      const result = await dismissRecommendation('u1', 'r1');

      expect(result.status).toBe('dismissed');
    });

    it('throws 404 when recommendation not found', async () => {
      mockedRecFindUnique.mockResolvedValue(null);

      await expect(dismissRecommendation('u1', 'r1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('listRecommendations', () => {
    it('returns recommendations ordered by score desc', async () => {
      const recs = [
        {
          id: 'r1',
          userId: 'u1',
          projectId: 'p1',
          taskId: 't1',
          score: 0.8,
          reason: 'Good match',
          factors: {},
          status: 'pending',
          createdAt: new Date(),
          expiresAt: new Date(),
          task: { id: 't1', title: 'Task 1', priority: 'HIGH', dueDate: null },
        },
      ];
      mockedRecFindMany.mockResolvedValue(recs);

      const result = await listRecommendations('u1');

      expect(result).toHaveLength(1);
      expect(result[0].task?.title).toBe('Task 1');
    });

    it('filters by status when provided', async () => {
      mockedRecFindMany.mockResolvedValue([]);

      await listRecommendations('u1', 'accepted');

      expect(mockedRecFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', status: 'accepted' },
        })
      );
    });
  });

  describe('getStats', () => {
    it('returns recommendation statistics', async () => {
      mockedRecCount.mockResolvedValue(10);
      mockedRecAggregate.mockResolvedValue({ _avg: { score: 0.75 } });

      const stats = await getStats('u1');

      expect(stats.total).toBe(10);
      expect(stats.avgScore).toBe(0.75);
    });
  });
});
