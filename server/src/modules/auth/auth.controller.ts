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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/**
 * Attach tokens only as httpOnly cookies.
 * In production the frontend is served from a different origin
 * (Cloudflare Pages vs the API host), so sameSite must be 'none'.
 */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): string {
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
  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return csrfToken;
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
  const csrfToken = setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.CREATED).json({ success: true, user: result.user, csrfToken });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    throw validationError(body.error, 'Invalid login data');
  }

  const result = await authService.login(body.data);
  const csrfToken = setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.OK).json({ success: true, user: result.user, csrfToken });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) throw new AppError('Missing refresh token cookie', StatusCodes.BAD_REQUEST);
  const result = await authService.refresh(refreshToken);
  const csrfToken = setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(StatusCodes.OK).json({ success: true, user: result.user, csrfToken });
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

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const result = await authService.forgotPassword(parsed.data.email);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'If an account exists for this email, a password reset link has been sent.',
    // Present only outside production so the flow can be tested without email.
    resetToken: result.resetToken,
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  await authService.resetPassword(parsed.data.token, parsed.data.newPassword);
  res.status(StatusCodes.OK).json({ success: true, message: 'Password has been reset. You can now sign in.' });
});
