import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '../../utils/errors';
import * as analyticsService from './analytics.service';

export const overview = asyncHandler(async (req: Request, res: Response) => {
  const data = await analyticsService.getOverview(req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data });
});