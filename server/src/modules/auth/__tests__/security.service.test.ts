jest.mock('../../../lib/prisma', () => ({
  prisma: { securityAudit: { create: jest.fn().mockResolvedValue({ id: 's1' }) } },
}));

jest.mock('../../../lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { recordSecurityEvent } from '../security.service';
import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as { securityAudit: { create: jest.Mock } };

describe('security.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes a security audit row with the provided fields', async () => {
    await recordSecurityEvent({
      action: 'AUTH_LOGIN_FAILED',
      email: 'a@b.dev',
      ip: '1.2.3.4',
      metadata: { reason: 'Invalid credentials' },
    });

    expect(mockedPrisma.securityAudit.create).toHaveBeenCalledWith({
      data: {
        action: 'AUTH_LOGIN_FAILED',
        userId: null,
        email: 'a@b.dev',
        ip: '1.2.3.4',
        userAgent: null,
        metadata: { reason: 'Invalid credentials' },
      },
    });
  });

  it('never throws when the DB write fails (best-effort)', async () => {
    mockedPrisma.securityAudit.create.mockRejectedValue(new Error('db down'));
    await expect(
      recordSecurityEvent({ action: 'AUTH_TOKEN_INVALID', email: 'x@y.dev' })
    ).resolves.toBeUndefined();
  });
});
