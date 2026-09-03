import { Request, Response, NextFunction } from 'express';
import { indexProject, retrieve, assertProjectAccess } from './rag.service';
import { AppError, validationError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { indexProjectParamsSchema, searchQuerySchema } from './rag.schema';

export async function indexProjectHandler(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    if (!userId) throw new AppError('Chưa xác thực', StatusCodes.UNAUTHORIZED);
    const parsed = indexProjectParamsSchema.safeParse(req.params);
    if (!parsed.success) throw validationError(parsed.error);
    const { projectId } = parsed.data;
    await assertProjectAccess(userId, projectId, 'MEMBER');
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
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) throw validationError(parsed.error);
    const { q, projectId, topK } = parsed.data;
    const results = await retrieve(userId, q.trim(), { projectId, topK });
    res.json({ success: true, data: { query: q.trim(), results } });
  } catch (err) {
    next(err);
  }
}
