import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError, validationError } from '../../utils/errors';
import { CSRF_COOKIE, generateCsrfToken } from '../../middlewares/csrf';
import * as authService from './auth.service';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Attach tokens only as httpOnly cookies.
 * In production the frontend is served from a different origin
 * (Cloudflare Pages vs the API host), so sameSite must be 'none'.
 */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = secure ? 'none' : 'lax';
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: authService.tokenExpiryMs(),
  });
  // Double-submit CSRF token: readable by the client so it can echo it
  // back in the X-CSRF-Token header on mutation requests.
  res.cookie(CSRF_COOKIE, generateCsrfToken(), {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.clearCookie(CSRF_COOKIE);
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.safeParse(req.body);
  if (!body.success) {
    throw validationError(body.error, 'Invalid registration data');
  }

  const result = await authService.register(body.data);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.CREATED).json({ success: true, user: result.user });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    throw validationError(body.error, 'Invalid login data');
  }

  const result = await authService.login(body.data);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.OK).json({ success: true, user: result.user });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) throw new AppError('Missing refresh token cookie', StatusCodes.BAD_REQUEST);
  const result = await authService.refresh(refreshToken);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.OK).json({ success: true, user: result.user });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ success: true, user: req.user });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.body?.refreshToken as string | undefined) ?? req.cookies?.refresh_token;
  if (token) {
    await authService.logout(token);
  }
  clearAuthCookies(res);
  res.status(StatusCodes.OK).json({ success: true, message: 'Logged out' });
});
