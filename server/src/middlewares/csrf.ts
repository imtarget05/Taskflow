import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../utils/errors';

/**
 * Double-submit CSRF protection.
 *
 * When authentication relies on cookies (and SameSite=None in production),
 * mutation requests must prove they originate from our own client by echoing
 * the csrf_token cookie value back in the X-CSRF-Token header.
 *
 * - Safe methods are never checked.
 * - /api/auth/* is exempt: login/register run before a token exists
 *   (login is additionally rate-limited), and logout/refresh are low-risk.
 * - Requests without a csrf_token cookie are untouched (pre-auth state).
 */
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (req.path.startsWith('/api/auth')) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  if (!cookieToken) return next();

  const headerToken = req.headers[CSRF_HEADER];
  if (typeof headerToken !== 'string' || headerToken !== cookieToken) {
    throw new AppError('CSRF token mismatch', StatusCodes.FORBIDDEN);
  }
  next();
}