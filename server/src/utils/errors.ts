import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { recordSecurityEvent, recordRouteAudit } from '../modules/auth/security.service';

function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip as string | undefined;
}

/**
 * Custom application error with an HTTP status code.
 */
export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Wrap async route handlers so rejections reach the error middleware. */
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  void recordRouteAudit({
    action: 'ROUTE_404_PROBE',
    statusCode: StatusCodes.NOT_FOUND,
    path: req.originalUrl,
    ip: clientIp(req),
  });
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

/** Central error handler. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // Forbidden / auth-related failures are security-relevant; audit them.
    if (err.statusCode === StatusCodes.FORBIDDEN || err.statusCode === StatusCodes.UNAUTHORIZED) {
      void recordSecurityEvent({
        action: err.statusCode === StatusCodes.FORBIDDEN ? 'AUTH_FORBIDDEN' : 'AUTH_TOKEN_INVALID',
        userId: (req.user as { id?: string } | undefined)?.id ?? null,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] ?? null,
        metadata: { path: req.originalUrl, reason: err.message },
      });
    }
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof Error && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
    void recordSecurityEvent({
      action: 'AUTH_TOKEN_INVALID',
      userId: (req.user as { id?: string } | undefined)?.id ?? null,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      metadata: { path: req.originalUrl, reason: err.name },
    });
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: err.name === 'TokenExpiredError' ? 'Token expired' : ReasonPhrases.UNAUTHORIZED,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  // Prisma validation errors (e.g. wrong type supplied) → 400, not 500.
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn({ err, path: req.originalUrl }, 'Prisma validation error');
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Invalid input data',
    });
    return;
  }

  // Never leak internal error details to the client; log it structured.
  logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: ReasonPhrases.INTERNAL_SERVER_ERROR,
  });
}

export function validationError(error: { flatten: () => unknown }, message = 'Validation failed'): AppError {
  return new AppError(message, StatusCodes.BAD_REQUEST, error.flatten());
}
