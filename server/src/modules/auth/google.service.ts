import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { env } from '../../config/env';
import { issueTokens } from './auth.service';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthUrl(state: string): string {
  if (!isGoogleConfigured()) {
    throw new AppError('Google sign-in is not configured', 503);
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleRedirectUri(): string {
  // The callback always lives on the API host; FRONTEND_URL only controls
  // where the browser lands after the exchange completes.
  const base =
    env.GOOGLE_REDIRECT_ORIGIN ??
    (env.NODE_ENV === 'production'
      ? 'https://taskflow-server-illy.onrender.com'
      : 'http://localhost:4000');
  return `${base}/api/auth/google/callback`;
}

async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
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
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    throw new AppError('Google token exchange failed', 502);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  if (!access_token) {
    throw new AppError('Google token exchange failed', 502);
  }

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) {
    throw new AppError('Google profile fetch failed', 502);
  }
  const profile = (await infoRes.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
  if (!profile.sub || !profile.email) {
    throw new AppError('Google profile is incomplete', 502);
  }
  return { sub: profile.sub, email: profile.email.toLowerCase(), name: profile.name || 'Google User', picture: profile.picture };
}

export async function authenticateWithGoogle(code: string) {
  const profile = await exchangeCodeForProfile(code);
  const email = profile.email.toLowerCase().trim();

  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.sub } });
  if (byGoogleId) {
    return issueTokens({ id: byGoogleId.id, email: byGoogleId.email, name: byGoogleId.name });
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.googleId) {
      return issueTokens({ id: byEmail.id, email: byEmail.email, name: byEmail.name });
    }
    throw new AppError('EMAIL_EXISTS', 409);
  }

  const user = await prisma.user.create({
    data: { email, name: profile.name, googleId: profile.sub },
    select: { id: true, email: true, name: true },
  });
  return issueTokens(user);
}