import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '../../utils/errors';
import * as exportService from './export.service';

export const csv = asyncHandler(async (req: Request, res: Response) => {
  const { filename, csv } = await exportService.exportCsv(String(req.params.projectId), req.user!.id);
  res
    .status(StatusCodes.OK)
    .setHeader('Content-Type', 'text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
});

export const txt = asyncHandler(async (req: Request, res: Response) => {
  const { filename, text } = await exportService.exportTxt(String(req.params.projectId), req.user!.id);
  res
    .status(StatusCodes.OK)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(text);
});

export const sheets = asyncHandler(async (req: Request, res: Response) => {
  const result = await exportService.exportToGoogleSheets(
    String(req.params.projectId),
    req.user!.id,
    req.user!.email
  );
  res.status(StatusCodes.OK).json({ success: true, data: result });
});