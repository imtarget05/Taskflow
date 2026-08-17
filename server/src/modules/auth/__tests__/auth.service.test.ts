import bcrypt from 'bcryptjs';
import { register, login, refresh, logout } from '../auth.service';
import { AppError } from '../../../utils/errors';

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
      const { register: registerFn } = require('../auth.service');
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'x@y.com', name: 'X' });
      mockedPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      const auth = await registerFn({ email: 'x@y.com', password: 'password123', name: 'X' });

      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        token: auth.refreshToken,
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
  });

  describe('logout', () => {
    it('deletes the stored refresh token', async () => {
      mockedPrisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1' });
      mockedPrisma.refreshToken.delete.mockResolvedValue({});
      await expect(logout('token')).resolves.toBeUndefined();
      expect(mockedPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt1' } });
    });
  });
});