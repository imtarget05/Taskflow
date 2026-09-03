import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import crypto from 'crypto';
import { asyncHandler, AppError } from '../../utils/errors';
import { CSRF_COOKIE, generateCsrfToken } from '../../middlewares/csrf';
import { env } from '../../config/env';
import * as googleService from './google.service';
import { tokenExpiryMs } from './auth.service';
import { logger } from '../../lib/logger';
import { isDevGoogleEnabled, devRedirectToGoogle, devGoogleCallback } from './google.dev';

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

function redirectWithError(res: Response, message: string, origin?: string): void {
  const base = origin || env.FRONTEND_URL;
  res.redirect(`${base}/login?google_error=${encodeURIComponent(message)}`);
}

export const redirectToGoogle = asyncHandler(async (req: Request, res: Response) => {
  if (isDevGoogleEnabled()) {
    devRedirectToGoogle(req, res);
    return;
  }
  if (!googleService.isGoogleConfigured()) {
    throw new AppError('Google sign-in is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }
  const state = crypto.randomBytes(16).toString('hex');
  // Persist the initiating frontend origin so the callback redirects back to
  // the correct app. For a top-level navigation (clicking the Google button)
  // the browser sends a Referer, not an Origin header, so prefer that.
  let origin = env.FRONTEND_URL;
  const referer = req.headers.referer as string | undefined;
  if (referer) {
    try {
      origin = new URL(referer).origin;
    } catch {
      // keep default
    }
  }
  // The callback must share the browser-facing origin so the state cookie set
  // below is sent when Google redirects the user back (same-origin via the
  // Cloudflare Pages proxy). Derive it from the forwarded request headers.
  const redirectUri = googleService.clientRedirectUri(req);
  res.cookie(STATE_COOKIE, JSON.stringify({ state, origin }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/google',
  });
  res.redirect(googleService.buildAuthUrl(state, redirectUri));
});

export const googleStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) || isDevGoogleEnabled(),
      devMode: isDevGoogleEnabled(),
    },
  });
});

export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  if (isDevGoogleEnabled()) {
    await devGoogleCallback(req, res);
    return;
  }
  const rawCookie = req.cookies?.[STATE_COOKIE];
  const stateFromQuery = req.query.state as string | undefined;
  const code = req.query.code as string | undefined;

  res.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });

  let origin = env.FRONTEND_URL;
  let stateCookie: string | undefined;
  try {
    const parsed = rawCookie ? JSON.parse(rawCookie) : null;
    if (parsed && typeof parsed.state === 'string') {
      stateCookie = parsed.state;
      if (typeof parsed.origin === 'string' && parsed.origin) origin = parsed.origin;
    } else if (typeof rawCookie === 'string') {
      stateCookie = rawCookie;
    }
  } catch {
    stateCookie = rawCookie;
  }

  if (!stateCookie || !stateFromQuery || stateCookie !== stateFromQuery) {
    return redirectWithError(res, 'Invalid OAuth state. Please try again.', origin);
  }
  if (!code) {
    return redirectWithError(res, 'Google did not return an authorization code.', origin);
  }

  try {
    const redirectUri = googleService.clientRedirectUri(req);
    const result = await googleService.authenticateWithGoogle(code, redirectUri);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.redirect(`${origin}/?google=signed_in`);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === StatusCodes.CONFLICT) {
      return redirectWithError(res, 'This email is already registered with a password. Sign in with that account instead.', origin);
    }
    // Surface the underlying cause (token exchange / profile errors carry
    // Google's safe error description, e.g. redirect_uri_mismatch or
    // invalid_client) so production failures are diagnosable from the URL.
    // Unexpected non-AppError failures keep the generic message.
    const detail = err instanceof AppError ? err.message : 'Google sign-in failed. Please try again.';
    logger.error({ err }, 'Google OAuth callback failed');
    return redirectWithError(res, detail, origin);
  }
});