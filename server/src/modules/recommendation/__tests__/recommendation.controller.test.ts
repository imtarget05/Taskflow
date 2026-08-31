import { Request, Response, NextFunction } from 'express';
import {
  listMyRecommendations,
  refresh,
  getConfig,
  updateConfig,
  accept,
  dismiss,
  getStats,
  getMySkills,
  updateMySkills,
  getMyAvailability,
  updateMyAvailability,
} from '../recommendation.controller';

jest.mock('../recommendation.service', () => ({
  listRecommendations: jest.fn(),
  refreshRecommendations: jest.fn(),
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
  acceptRecommendation: jest.fn(),
  dismissRecommendation: jest.fn(),
  getStats: jest.fn(),
  getUserSkills: jest.fn(),
  updateUserSkills: jest.fn(),
  getUserAvailability: jest.fn(),
  updateUserAvailability: jest.fn(),
}));

import {
  listRecommendations,
  refreshRecommendations,
  getConfig as getServiceConfig,
  updateConfig as updateServiceConfig,
  acceptRecommendation,
  dismissRecommendation,
  getStats as getServiceStats,
  getUserSkills,
  updateUserSkills,
  getUserAvailability,
  updateUserAvailability,
} from '../recommendation.service';

const mockedListRecommendations = listRecommendations as jest.Mock;
const mockedRefreshRecommendations = refreshRecommendations as jest.Mock;
const mockedGetConfig = getServiceConfig as jest.Mock;
const mockedUpdateConfig = updateServiceConfig as jest.Mock;
const mockedAcceptRecommendation = acceptRecommendation as jest.Mock;
const mockedDismissRecommendation = dismissRecommendation as jest.Mock;
const mockedGetStats = getServiceStats as jest.Mock;
const mockedGetUserSkills = getUserSkills as jest.Mock;
const mockedUpdateUserSkills = updateUserSkills as jest.Mock;
const mockedGetUserAvailability = getUserAvailability as jest.Mock;
const mockedUpdateUserAvailability = updateUserAvailability as jest.Mock;

function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  } as unknown as Response;
  return res;
}

describe('recommendation.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('listMyRecommendations', () => {
    it('returns user recommendations', async () => {
      mockedListRecommendations.mockResolvedValue([
        { id: 'r1', taskId: 't1', score: 0.8 },
      ]);

      const req = { query: {}, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await listMyRecommendations(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedListRecommendations).toHaveBeenCalledWith('u1', undefined, 20);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 1 })
      );
    });

    it('passes status filter when provided', async () => {
      mockedListRecommendations.mockResolvedValue([]);

      const req = { query: { status: 'pending' }, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await listMyRecommendations(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedListRecommendations).toHaveBeenCalledWith('u1', 'pending', 20);
    });
  });

  describe('refresh', () => {
    it('refreshes recommendations', async () => {
      mockedRefreshRecommendations.mockResolvedValue([
        { id: 'r1', score: 0.9 },
      ]);

      const req = { body: {}, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await refresh(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedRefreshRecommendations).toHaveBeenCalledWith('u1', undefined, 10);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('passes projectId when provided', async () => {
      mockedRefreshRecommendations.mockResolvedValue([]);

      const req = { body: { projectId: 'p1' }, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await refresh(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedRefreshRecommendations).toHaveBeenCalledWith('u1', 'p1', 10);
    });
  });

  describe('getConfig', () => {
    it('returns config', async () => {
      mockedGetConfig.mockResolvedValue({
        skillMatch: 0.4,
        availability: 0.25,
        priority: 0.2,
        history: 0.1,
        workloadBalance: 0.05,
      });

      const req = {} as Request;
      const res = mockResponse();

      await getConfig(req, res, jest.fn() as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('updateConfig', () => {
    it('updates config', async () => {
      mockedUpdateConfig.mockResolvedValue({
        skillMatch: 0.5,
        availability: 0.25,
        priority: 0.2,
        history: 0.1,
        workloadBalance: 0.05,
      });

      const req = { body: { skillMatch: 0.5 } } as Request;
      const res = mockResponse();

      await updateConfig(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedUpdateConfig).toHaveBeenCalledWith({ skillMatch: 0.5 });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('accept', () => {
    it('accepts a recommendation', async () => {
      mockedAcceptRecommendation.mockResolvedValue({ id: 'r1', status: 'accepted' });

      const req = { params: { id: 'r1' }, body: {}, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await accept(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedAcceptRecommendation).toHaveBeenCalledWith('u1', 'r1', true);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('passes assign=false when specified', async () => {
      mockedAcceptRecommendation.mockResolvedValue({ id: 'r1', status: 'accepted' });

      const req = { params: { id: 'r1' }, body: { assign: false }, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await accept(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedAcceptRecommendation).toHaveBeenCalledWith('u1', 'r1', false);
    });
  });

  describe('dismiss', () => {
    it('dismisses a recommendation', async () => {
      mockedDismissRecommendation.mockResolvedValue({ id: 'r1', status: 'dismissed' });

      const req = { params: { id: 'r1' }, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await dismiss(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedDismissRecommendation).toHaveBeenCalledWith('u1', 'r1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getStats', () => {
    it('returns user stats', async () => {
      mockedGetStats.mockResolvedValue({
        total: 10,
        pending: 5,
        accepted: 3,
        dismissed: 2,
        avgScore: 0.75,
        acceptanceRate: 0.3,
      });

      const req = { user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await getStats(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedGetStats).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getMySkills', () => {
    it('returns user skills', async () => {
      mockedGetUserSkills.mockResolvedValue([
        { id: 's1', skill: 'react', level: 5 },
      ]);

      const req = { user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await getMySkills(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedGetUserSkills).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateMySkills', () => {
    it('updates user skills', async () => {
      mockedUpdateUserSkills.mockResolvedValue([
        { id: 's1', skill: 'react', level: 4 },
      ]);

      const req = {
        body: { skills: [{ skill: 'react', level: 4 }] },
        user: { id: 'u1' },
      } as unknown as Request;
      const res = mockResponse();

      await updateMySkills(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedUpdateUserSkills).toHaveBeenCalledWith('u1', [{ skill: 'react', level: 4 }]);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getMyAvailability', () => {
    it('returns user availability', async () => {
      mockedGetUserAvailability.mockResolvedValue([
        { id: 'a1', dayOfWeek: 1, morning: true, afternoon: true, evening: false },
      ]);

      const req = { user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await getMyAvailability(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedGetUserAvailability).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateMyAvailability', () => {
    it('updates user availability', async () => {
      mockedUpdateUserAvailability.mockResolvedValue([
        { id: 'a1', dayOfWeek: 1, morning: true, afternoon: true, evening: false },
      ]);

      const req = {
        body: [{ dayOfWeek: 1, morning: true, afternoon: true }],
        user: { id: 'u1' },
      } as unknown as Request;
      const res = mockResponse();

      await updateMyAvailability(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedUpdateUserAvailability).toHaveBeenCalledWith('u1', [
        { dayOfWeek: 1, morning: true, afternoon: true },
      ]);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
