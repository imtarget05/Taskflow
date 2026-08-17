import { NextFunction, Request, Response } from 'express';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

/**
 * Custom application error with an HTTP status code.
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = StatusCodes.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/** Wrap async route handlers so rejections reach the error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

/** Central error handler. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  if (err instanceof Error && err.name === 'JsonWebTokenError') {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: ReasonPhrases.UNAUTHORIZED,
    });
    return;
  }

  if (err instanceof Error && err.name === 'TokenExpiredError') {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'Token expired',
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: ReasonPhrases.INTERNAL_SERVER_ERROR,
  });
}
