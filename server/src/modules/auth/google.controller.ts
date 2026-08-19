import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import crypto from 'crypto';
import { asyncHandler, AppError } from '../../utils/errors';
import { CSRF_COOKIE, generateCsrfToken } from '../../middlewares/csrf';
import { env } from '../../config/env';
import * as googleService from './google.service';
import { tokenExpiryMs } from './auth.service';

const STATE_COOKIE = 'google_oauth_state';

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
    maxAge: tokenExpiryMs(),
  });
  res.cookie(CSRF_COOKIE, generateCsrfToken(), {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function redirectWithError(res: Response, message: string): void {
  res.redirect(`${env.FRONTEND_URL}/login?google_error=${encodeURIComponent(message)}`);
}

export const redirectToGoogle = asyncHandler(async (_req: Request, res: Response) => {
  if (!googleService.isGoogleConfigured()) {
    throw new AppError('Google sign-in is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/google',
  });
  res.redirect(googleService.buildAuthUrl(state));
});

export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const stateCookie = req.cookies?.[STATE_COOKIE];
  const stateFromQuery = req.query.state as string | undefined;
  const code = req.query.code as string | undefined;

  res.clearCookie(STATE_COOKIE);

  if (!stateCookie || !stateFromQuery || stateCookie !== stateFromQuery) {
    return redirectWithError(res, 'Invalid OAuth state. Please try again.');
  }
  if (!code) {
    return redirectWithError(res, 'Google did not return an authorization code.');
  }

  try {
    const result = await googleService.authenticateWithGoogle(code);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.redirect(`${env.FRONTEND_URL}/?google=signed_in`);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === StatusCodes.CONFLICT) {
      return redirectWithError(res, 'This email is already registered with a password. Sign in with that account instead.');
    }
    return redirectWithError(res, 'Google sign-in failed. Please try again.');
  }
});