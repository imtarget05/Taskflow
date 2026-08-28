import { Request, Response, RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler, AppError } from '../../utils/errors';
import * as scNlpService from './sc-nlp.service';

const analyseOrderSchema = scNlpService.analyseOrderSchema;

export const analyseOrder: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = analyseOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', StatusCodes.BAD_REQUEST, parsed.error.flatten());
  }

  const { user } = req;
  if (!user) throw new AppError('Unauthenticated', StatusCodes.UNAUTHORIZED);

  const result = await scNlpService.analyseOrder(user.id, parsed.data);

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});
