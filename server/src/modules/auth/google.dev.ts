/**
 * Mock Google OAuth for local development.
 *
 * This allows testing the OAuth flow without real Google credentials.
 * Only active when:
 * - NODE_ENV !== 'production'
 * - GOOGLE_CLIENT_ID starts with 'dev-'
 *
 * To enable dev mode:
 * 1. Set GOOGLE_CLIENT_ID=dev-mock-client-id in .env
 * 2. Set GOOGLE_CLIENT_SECRET=dev-mock-secret in .env
 * 3. The OAuth flow will redirect back with a mock user
 */

import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { signAccessToken, signRefreshToken } from '../../utils/token';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

const IS_DEV_MODE =
  env.NODE_ENV !== 'production' && (env.GOOGLE_CLIENT_ID?.startsWith('dev-') ?? false);

export function isDevGoogleEnabled(): boolean {
  return IS_DEV_MODE;
}

/**
 * Dev redirect — simulates Google OAuth redirect with a mock code.
 *
 * The browser is bounced back to the API server's callback handler so the
 * server can complete the sign-in flow locally without Google. The origin is
 * derived from the incoming request (not GOOGLE_REDIRECT_ORIGIN) so the
 * callback always lands on the same server that received the redirect request.
 */
export function devRedirectToGoogle(req: Request, res: Response): void {
  const state = Math.random().toString(36).slice(2);
  res.cookie('google_oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  // Derive the API origin from the request so the callback always hits the
  // same server (works behind a proxy via trust-proxy, and in local dev).
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) ||
    (req.get('host') as string | undefined) ||
    'localhost:4000';
  const callbackUrl = `${proto}://${host}/api/auth/google/callback?code=dev-mock-code&state=${state}`;
  res.redirect(callbackUrl);
}

/**
 * Dev callback - creates/logs in a mock user
 */
export async function devGoogleCallback(_req: Request, res: Response): Promise<void> {
  try {
    const devEmail = 'dev@taskflow.local';
    let user = await prisma.user.findUnique({ where: { email: devEmail } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: devEmail,
          name: 'Dev User',
          googleId: 'dev-google-123',
        },
      });
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email, name: user.name });
    const refreshToken = signRefreshToken(user.id);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.info({ userId: user.id, email: user.email }, 'Dev Google OAuth sign-in');

    const frontendUrl = env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontendUrl}/?google=signed_in`);
  } catch (err) {
    logger.error({ err }, 'Dev Google OAuth error');
    const frontendUrl = env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?google_error=dev_auth_failed`);
  }
}
