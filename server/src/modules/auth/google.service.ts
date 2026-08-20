import type { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { env } from '../../config/env';
import { issueTokens, type AuthResult } from './auth.service';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthUrl(state: string, redirectUri: string = googleRedirectUri()): string {
  if (!isGoogleConfigured()) {
    throw new AppError('Google sign-in is not configured', 503);
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleRedirectUri(): string {
  const base =
    env.GOOGLE_REDIRECT_ORIGIN ??
    (env.NODE_ENV === 'production'
      ? 'https://taskflow-server-illy.onrender.com'
      : 'http://localhost:4000');
  return `${base}/api/auth/google/callback`;
}

/**
 * The browser-facing callback URL for the current request. Behind the
 * Cloudflare Pages proxy the client host is the Pages origin (sent via
 * x-forwarded-host/-proto), so the Google state cookie and the callback stay
 * on the same origin. Falls back to the explicit env override or the static
 * API origin when the headers are absent (direct API hits).
 */
export function clientRedirectUri(req: Request): string {
  // Priority 1: explicit env override (GOOGLE_REDIRECT_ORIGIN)
  if (env.GOOGLE_REDIRECT_ORIGIN) {
    return `${env.GOOGLE_REDIRECT_ORIGIN}/api/auth/google/callback`;
  }
  // Priority 2: forwarded headers from proxy (Pages → Render)
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'https';
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  if (typeof host === 'string' && host) {
    return `${proto}://${host}/api/auth/google/callback`;
  }
  // Priority 3: static fallback
  return googleRedirectUri();
}

interface GoogleTokens {
  access_token: string;
  [key: string]: unknown;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  [key: string]: unknown;
}

async function exchangeCodeForProfile(code: string, redirectUri: string): Promise<GoogleProfile> {
  if (!isGoogleConfigured()) {
    throw new AppError('Google sign-in is not configured', 503);
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID as string,
      client_secret: env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new AppError(`Google token exchange failed: ${err}`, 502);
  }

  const tokens = await tokenRes.json() as GoogleTokens;
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!infoRes.ok) {
    throw new AppError('Google profile fetch failed', 502);
  }

  const profile = await infoRes.json() as GoogleUserInfo;
  if (!profile.sub || !profile.email) {
    throw new AppError('Google profile is incomplete', 502);
  }

  return {
    sub: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name || 'Google User',
    picture: profile.picture,
  };
}

export async function authenticateWithGoogle(code: string, redirectUri: string = googleRedirectUri()): Promise<AuthResult> {
  if (!isGoogleConfigured()) {
    throw new AppError('Google sign-in is not configured', 503);
  }

  const profile = await exchangeCodeForProfile(code, redirectUri);

  // First try to find user by googleId
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.sub } });
  if (byGoogleId) {
    return issueTokens({ id: byGoogleId.id, email: byGoogleId.email, name: byGoogleId.name });
  }

  // Then try to find by email (link Google identity to existing account)
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (byEmail.googleId) {
      return issueTokens({ id: byEmail.id, email: byEmail.email, name: byEmail.name });
    }
    // Link Google identity to existing password account
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: profile.sub },
    });
    return issueTokens({ id: byEmail.id, email: byEmail.email, name: byEmail.name });
  }

  // Create new user
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      googleId: profile.sub,
    },
  });
  return issueTokens({ id: user.id, email: user.email, name: user.name });
}
