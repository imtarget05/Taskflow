import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../utils/errors';
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

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/** Attach tokens as httpOnly cookies + return them in body (for mobile / flexibility). */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: authService.tokenExpiryMs(),
  });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError('Invalid registration data', StatusCodes.BAD_REQUEST);
  }

  const result = await authService.register(body.data);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.CREATED).json({ success: true, ...result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError('Invalid login data', StatusCodes.BAD_REQUEST);
  }

  const result = await authService.login(body.data);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.OK).json({ success: true, ...result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError('Missing refreshToken', StatusCodes.BAD_REQUEST);
  }

  const result = await authService.refresh(body.data.refreshToken);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.OK).json({ success: true, ...result });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ success: true, user: req.user });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.body?.refreshToken as string | undefined) ?? req.cookies?.refresh_token;
  if (token) {
    await authService.logout(token);
  }
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.status(StatusCodes.OK).json({ success: true, message: 'Logged out' });
});