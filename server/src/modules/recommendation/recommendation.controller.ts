import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler, validationError } from '../../utils/errors';
import * as recommendationService from './recommendation.service';
import {
  updateWeightsSchema,
  refreshSchema,
  listSchema,
  acceptSchema,
  idParamSchema,
  updateSkillsSchema,
  updateAvailabilitySchema,
} from './recommendation.schema';

// GET /api/recommendations/me
export const listMyRecommendations = asyncHandler(async (req: Request, res: Response) => {
  const query = listSchema.safeParse(req.query);
  if (!query.success) throw validationError(query.error, 'Invalid query params');

  const userId = req.user!.id;
  const { status, limit } = query.data;

  const recommendations = await recommendationService.listRecommendations(userId, status, limit ?? 20);

  res.status(StatusCodes.OK).json({
    success: true,
    data: recommendations,
    count: recommendations.length,
  });
});

// POST /api/recommendations/refresh
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid request body');

  const userId = req.user!.id;
  const { projectId, limit } = body.data;

  const recommendations = await recommendationService.refreshRecommendations(userId, projectId, limit ?? 10);

  res.status(StatusCodes.OK).json({
    success: true,
    data: recommendations,
    count: recommendations.length,
  });
});

// GET /api/recommendations/config
export const getConfig = asyncHandler(async (_req: Request, res: Response) => {
  const config = await recommendationService.getConfig();

  res.status(StatusCodes.OK).json({
    success: true,
    data: config,
  });
});

// PUT /api/recommendations/config
export const updateConfig = asyncHandler(async (req: Request, res: Response) => {
  const body = updateWeightsSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid weights');

  const config = await recommendationService.updateConfig(body.data);

  res.status(StatusCodes.OK).json({
    success: true,
    data: config,
  });
});

// POST /api/recommendations/:id/accept
export const accept = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid recommendation id');

  const body = acceptSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid request body');

  const userId = req.user!.id;
  const result = await recommendationService.acceptRecommendation(
    userId,
    params.data.id,
    body.data.assign ?? true
  );

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});

// POST /api/recommendations/:id/dismiss
export const dismiss = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid recommendation id');

  const userId = req.user!.id;
  const result = await recommendationService.dismissRecommendation(userId, params.data.id);

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});

// GET /api/recommendations/stats
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const stats = await recommendationService.getStats(userId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: stats,
  });
});

// GET /api/users/me/skills
export const getMySkills = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const skills = await recommendationService.getUserSkills(userId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: skills,
  });
});

// PUT /api/users/me/skills
export const updateMySkills = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSkillsSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid skills data');

  const userId = req.user!.id;
  const skills = await recommendationService.updateUserSkills(userId, body.data.skills);

  res.status(StatusCodes.OK).json({
    success: true,
    data: skills,
  });
});

// GET /api/users/me/availability
export const getMyAvailability = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const availability = await recommendationService.getUserAvailability(userId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: availability,
  });
});

// PUT /api/users/me/availability
export const updateMyAvailability = asyncHandler(async (req: Request, res: Response) => {
  const body = updateAvailabilitySchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid availability data');

  const userId = req.user!.id;
  const availability = await recommendationService.updateUserAvailability(userId, body.data);

  res.status(StatusCodes.OK).json({
    success: true,
    data: availability,
  });
});
