import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/token';
import { env } from '../../config/env';
import { createHash, randomBytes } from 'crypto';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueTokens(user: { id: string; email: string; name: string }): Promise<AuthResult> {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);

  // Persist refresh token (hashed for safety) so logout/rotation is possible.
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + tokenExpiryMs()),
    },
  });

  return { accessToken, refreshToken, user };
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult> {
  const email = data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const hashed = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { email, name: data.name.trim(), password: hashed },
    select: { id: true, email: true, name: true },
  });

  return issueTokens(user);
}

export async function login(data: { email: string; password: string }): Promise<AuthResult> {
  const email = data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  return issueTokens({ id: user.id, email: user.email, name: user.name });
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  if (payload.type !== 'refresh') {
    throw new AppError('Invalid refresh token', 401);
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(refreshToken) } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError('Refresh token expired or revoked', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    throw new AppError('User not found', 401);
  }

  // Rotate: revoke old token, issue new pair.
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  return issueTokens(user);
}

export async function logout(refreshToken: string): Promise<void> {
  if (!refreshToken) return;
  try {
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(refreshToken) } });
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
    }
  } catch {
    // Logout is best-effort; ignore failures.
  }
}

export async function cleanupExpiredRefreshTokens(): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export interface ForgotPasswordResult {
  // The raw token is only returned in non-production so the flow can be
  // tested without a configured email provider. In production the caller
  // would send it by email instead.
  resetToken?: string;
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const normalized = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Always return success to avoid leaking which emails are registered.
  if (!user || !user.password) {
    return {};
  }

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.user.update({
    where: { email: normalized },
    data: {
      passwordResetToken: hashRefreshToken(token),
      passwordResetExpires: expires,
    },
  });

  if (env.NODE_ENV !== 'production') {
    return { resetToken: token };
  }
  return {};
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!token || newPassword.length < 8) {
    throw new AppError('Invalid reset request', 400);
  }
  const hashed = hashRefreshToken(token);
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: hashed },
  });
  if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(newPassword, 10),
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
}

export function tokenExpiryMs(): number {
  const match = env.JWT_REFRESH_EXPIRES_IN.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const [, value, unit] = match;
  const n = parseInt(value, 10);
  switch (unit) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}
