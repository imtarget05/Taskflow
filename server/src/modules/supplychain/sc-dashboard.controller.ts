import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '../../utils/errors';
import * as scDashboardService from './sc-dashboard.service';

export const getMetrics = asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const userId = req.user!.id;

  const metrics = await scDashboardService.getSCDashboard(projectId, userId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: metrics,
  });
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const userId = req.user!.id;

  const metrics = await scDashboardService.getSCDashboard(projectId, userId);
  const { filename, csv } = scDashboardService.scDashboardToCsv(metrics);

  res
    .status(StatusCodes.OK)
    .setHeader('Content-Type', 'text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
});

export const exportTxt = asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const userId = req.user!.id;

  const metrics = await scDashboardService.getSCDashboard(projectId, userId);
  const { filename, text } = scDashboardService.scDashboardToTxt(metrics);

  res
    .status(StatusCodes.OK)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(text);
});
