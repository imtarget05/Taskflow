import {
  buildAuthUrl,
  googleRedirectUri,
  clientRedirectUri,
  isGoogleConfigured,
  authenticateWithGoogle,
} from '../google.service';
import { env } from '../../../config/env';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  refreshToken: { create: jest.Mock };
};

const realClientId = env.GOOGLE_CLIENT_ID;
const realClientSecret = env.GOOGLE_CLIENT_SECRET;
const realRedirectOrigin = env.GOOGLE_REDIRECT_ORIGIN;

describe('google.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    env.GOOGLE_CLIENT_ID = realClientId;
    env.GOOGLE_CLIENT_SECRET = realClientSecret;
    env.GOOGLE_REDIRECT_ORIGIN = realRedirectOrigin;
  });

  describe('isGoogleConfigured', () => {
    it('is false when credentials are missing', () => {
      env.GOOGLE_CLIENT_ID = undefined;
      env.GOOGLE_CLIENT_SECRET = undefined;
      expect(isGoogleConfigured()).toBe(false);
    });

    it('is true when credentials are present', () => {
      env.GOOGLE_CLIENT_ID = 'client-id';
      env.GOOGLE_CLIENT_SECRET = 'client-secret';
      expect(isGoogleConfigured()).toBe(true);
    });
  });

  describe('buildAuthUrl', () => {
    it('builds a google authorize url with state and redirect_uri', () => {
      env.GOOGLE_CLIENT_ID = 'client-id';
      env.GOOGLE_CLIENT_SECRET = 'client-secret';
      const url = buildAuthUrl('state-123');
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('state=state-123');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain(encodeURIComponent(googleRedirectUri()));
    });

    it('throws 503 when not configured', () => {
      env.GOOGLE_CLIENT_ID = undefined;
      env.GOOGLE_CLIENT_SECRET = undefined;
      expect(() => buildAuthUrl('s')).toThrow(
        expect.objectContaining({ statusCode: 503 })
      );
    });
  });

  describe('clientRedirectUri', () => {
    it('derives the callback URL from the forwarded Pages proxy headers', () => {
      const req = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'taskflow-8kv.pages.dev',
        },
      } as unknown as Parameters<typeof clientRedirectUri>[0];

      expect(clientRedirectUri(req)).toBe(
        'https://taskflow-8kv.pages.dev/api/auth/google/callback'
      );
    });

    it('falls back to the static API origin without forwarded headers', () => {
      const req = { headers: {} } as unknown as Parameters<typeof clientRedirectUri>[0];
      expect(clientRedirectUri(req)).toBe(googleRedirectUri());
    });
  });

  describe('authenticateWithGoogle', () => {
    const profile = { sub: 'g1', email: 'google@example.com', name: 'Google User' };

    beforeEach(() => {
      env.GOOGLE_CLIENT_ID = 'client-id';
      env.GOOGLE_CLIENT_SECRET = 'client-secret';
      env.GOOGLE_REDIRECT_ORIGIN = 'http://localhost:4000';
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      } as unknown as Response).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...profile }),
      } as unknown as Response);
      mockedPrisma.refreshToken.create.mockResolvedValue({});
    });

    it('creates a new user from the google profile', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({
        id: 'u1',
        email: profile.email,
        name: profile.name,
      });

      const result = await authenticateWithGoogle('code-1');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockedPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ googleId: 'g1' }),
        })
      );
      expect(mockedPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ password: expect.anything() }),
        })
      );
    });

    it('logs in an existing google-linked user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: profile.email,
        name: profile.name,
        googleId: 'g1',
      });

      const result = await authenticateWithGoogle('code-1');
      expect(result.user.id).toBe('u1');
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    });

    it('links the Google identity to an existing password account', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'u2',
        email: profile.email,
        name: 'Other',
        googleId: null,
      });
      mockedPrisma.user.update.mockResolvedValue({
        id: 'u2',
        email: profile.email,
        name: 'Other',
      });

      const result = await authenticateWithGoogle('code-1');
      expect(result.user.id).toBe('u2');
      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: { googleId: 'g1' },
        select: { id: true, email: true, name: true },
      });
    });

    it('throws 502 when google rejects the token exchange', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as unknown as Response);

      await expect(authenticateWithGoogle('bad-code')).rejects.toMatchObject({
        statusCode: 502,
      });
    });

    it('throws 502 when the profile is incomplete', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) } as unknown as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'g1' }) } as unknown as Response);

      await expect(authenticateWithGoogle('code-1')).rejects.toMatchObject({
        statusCode: 502,
      });
    });
  });
});