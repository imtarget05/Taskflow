import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { register, login, refresh, logout, cleanupExpiredRefreshTokens, tokenExpiryMs, forgotPassword, resetPassword } from '../auth.service';
import { AppError } from '../../../utils/errors';
import { env } from '../../../config/env';


// Mock isEmailConfigured to return false so forgotPassword returns the dev-mode token.
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { ...actual, isEmailConfigured: () => false };
});

// Mock the prisma client entirely.
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
};

describe('auth.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'new@email.com',
        name: 'New User',
      });
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      const result = await register({ email: 'new@email.com', password: 'password123', name: 'New User' });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('new@email.com');
      expect(mockedPrisma.user.create).toHaveBeenCalled();
    });

    it('throws 409 when the email already exists', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'dup@email.com' });

      await expect(register({ email: 'dup@email.com', password: 'password123', name: 's' })).rejects.toThrow(
        AppError
      );
      await expect(
        register({ email: 'dup@email.com', password: 'password123', name: 's' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        password: 'hashed',
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      const result = await login({ email: 'a@b.com', password: 'password123' });
      expect(result.accessToken).toBeDefined();
      expect(result.user.id).toBe('u1');
    });

    it('throws 401 for wrong password', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        password: 'hashed',
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(login({ email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('throws 401 when user does not exist', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      await expect(login({ email: 'nope@b.com', password: 'x' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'x@y.com', name: 'X' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await register({ email: 'x@y.com', password: 'password123', name: 'X' });

      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100000),
      });
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'x@y.com', name: 'X' });

      const result = await refresh(auth.refreshToken);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).not.toBe(auth.refreshToken);
    });

    it('throws 401 for a revoked token', async () => {
      mockedPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(refresh('expired-token')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws 401 when the token is not a refresh token', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 't@y.com', name: 'T' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await register({ email: 't@y.com', password: 'password123', name: 'T' });

      await expect(refresh(auth.accessToken)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws 401 when the stored token has expired', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'e@y.com', name: 'E' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await register({ email: 'e@y.com', password: 'password123', name: 'E' });

      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(refresh(auth.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('detects reuse of an already-claimed token and revokes all sessions', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'r@y.com', name: 'R' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await register({ email: 'r@y.com', password: 'password123', name: 'R' });

      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100000),
      });
      // First use: claim succeeds.
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'r@y.com', name: 'R' });
      await refresh(auth.refreshToken);

      // Second use of the SAME token: claim fails → reuse attack.
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      mockedPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await expect(refresh(auth.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
      expect(mockedPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    it('claims a token atomically (updateMany where usedAt is null)', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'c@y.com', name: 'C' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await register({ email: 'c@y.com', password: 'password123', name: 'C' });

      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100000),
      });
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'c@y.com', name: 'C' });

      await refresh(auth.refreshToken);
      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('throws 401 when the user no longer exists', async () => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'u@y.com', name: 'U' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await register({ email: 'u@y.com', password: 'password123', name: 'U' });

      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100000),
      });
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      await expect(refresh(auth.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('logout', () => {
    it('deletes the stored refresh token', async () => {
      mockedPrisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1' });
      mockedPrisma.refreshToken.delete.mockResolvedValue({});
      await expect(logout('token')).resolves.toBeUndefined();
      expect(mockedPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt1' } });
    });

    it('is a no-op without a token', async () => {
      await expect(logout('')).resolves.toBeUndefined();
      expect(mockedPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredRefreshTokens', () => {
    it('deletes tokens whose expiry is in the past', async () => {
      mockedPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await cleanupExpiredRefreshTokens();

      expect(mockedPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe('tokenExpiryMs', () => {
    const original = env.JWT_REFRESH_EXPIRES_IN;

    afterEach(() => {
      env.JWT_REFRESH_EXPIRES_IN = original;
    });

    it.each([
      ['30s', 30_000],
      ['45m', 45 * 60_000],
      ['12h', 12 * 60 * 60_000],
      ['2d', 2 * 24 * 60 * 60_000],
    ])('parses "%s"', (raw, expected) => {
      env.JWT_REFRESH_EXPIRES_IN = raw;
      expect(tokenExpiryMs()).toBe(expected);
    });

    it('falls back to 7 days for unparseable values', () => {
      env.JWT_REFRESH_EXPIRES_IN = 'bogus';
      expect(tokenExpiryMs()).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('forgotPassword', () => {
    const prevEnv = env.NODE_ENV;
    afterEach(() => {
      env.NODE_ENV = prevEnv;
    });

    it('returns a reset token in non-production and stores the hash', async () => {
      env.NODE_ENV = 'development';
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', password: 'hashed' });
      mockedPrisma.user.update.mockResolvedValue({});
      const res = await forgotPassword('a@b.com');
      expect(res.resetToken).toBeDefined();
      expect(mockedPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'a@b.com' },
          data: expect.objectContaining({
            passwordResetToken: expect.any(String),
            passwordResetExpires: expect.any(Date),
          }),
        }),
      );
    });

    it('does not leak whether an email exists', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      const res = await forgotPassword('missing@b.com');
      expect(res.resetToken).toBeUndefined();
      expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    });

    it('skips users without a password (Google-only accounts)', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'g1', googleId: 'x' });
      const res = await forgotPassword('g@b.com');
      expect(res.resetToken).toBeUndefined();
      expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates the password for a valid token', async () => {
      const token = 'abcdef123456';
      const hashed = createHash('sha256').update(token).digest('hex');
      mockedPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        passwordResetToken: hashed,
        passwordResetExpires: new Date(Date.now() + 60000),
      });
      mockedPrisma.user.update.mockResolvedValue({});
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('newhashed' as never);
      await resetPassword(token, 'newpassword123');
      expect(mockedPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            password: 'newhashed',
            passwordResetToken: null,
            passwordResetExpires: null,
          }),
        }),
      );
    });

    it('throws for an expired token', async () => {
      const token = 'expiredtoken';
      const hashed = createHash('sha256').update(token).digest('hex');
      mockedPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        passwordResetToken: hashed,
        passwordResetExpires: new Date(Date.now() - 60000),
      });
      await expect(resetPassword(token, 'newpassword123')).rejects.toBeInstanceOf(AppError);
    });

    it('throws for an unknown token', async () => {
      mockedPrisma.user.findFirst.mockResolvedValue(null);
      await expect(resetPassword('nope', 'newpassword123')).rejects.toBeInstanceOf(AppError);
    });

    it('throws for a too-short password', async () => {
      await expect(resetPassword('token', 'short')).rejects.toBeInstanceOf(AppError);
    });
  });
});
