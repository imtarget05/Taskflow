import bcrypt from 'bcryptjs';
import { register, login, refresh, logout, cleanupExpiredRefreshTokens, tokenExpiryMs } from '../auth.service';
import { AppError } from '../../../utils/errors';
import { env } from '../../../config/env';

// Mock the prisma client entirely.
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
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
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100000),
      });
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'x@y.com', name: 'X' });
      mockedPrisma.refreshToken.delete.mockResolvedValue({});

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
});
