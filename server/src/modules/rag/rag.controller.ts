import { Request, Response, NextFunction } from 'express';
import { indexProject, retrieve, assertProjectAccess } from './rag.service';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';

export async function indexProjectHandler(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    if (!userId) throw new AppError('Chưa xác thực', StatusCodes.UNAUTHORIZED);
    const projectId = String(req.params.projectId);
    await assertProjectAccess(userId, projectId);
    const indexed = await indexProject(projectId);
    res.json({ success: true, data: { projectId, indexed } });
  } catch (err) {
    next(err);
  }
}

export async function searchHandler(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    if (!userId) throw new AppError('Chưa xác thực', StatusCodes.UNAUTHORIZED);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) throw new AppError('Thiếu tham số q', StatusCodes.BAD_REQUEST);
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const topK = req.query.topK ? parseInt(String(req.query.topK), 10) : undefined;
    const results = await retrieve(userId, q, { projectId, topK });
    res.json({ success: true, data: { query: q, results } });
  } catch (err) {
    next(err);
  }
}
