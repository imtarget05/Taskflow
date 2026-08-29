import { AppError } from '../../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import * as scNlpService from '../sc-nlp.service';

// Mock prisma + deps used by analyseOrder
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    project: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
    sCOrderAnalysis: { create: jest.fn() },
  },
}));

jest.mock('../sc-nlp.service', () => {
  // We mock deps but keep the real analyseOrder; instead import the module under test
  // without mock-factory for itself. Use requireActual for the service.
  return jest.requireActual('../sc-nlp.service');
});

jest.mock('../../agent/llm', () => ({
  isLLMConfigured: () => false,
  chatCompletion: jest.fn(),
}));

jest.mock('../../integrations/n8n', () => ({
  dispatchToN8n: jest.fn().mockResolvedValue(true),
  isN8nConfigured: () => false,
}));

jest.mock('../../../lib/socket', () => ({
  emitToProject: jest.fn(),
  SOCKET_EVENTS: {},
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  project: { findUnique: jest.Mock };
  order: { findUnique: jest.Mock };
  sCOrderAnalysis: { create: jest.Mock };
};

describe('sc-nlp.service.analyseOrder validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: project + order exist, create succeeds
    mockedPrisma.project.findUnique.mockResolvedValue({ id: 'proj-real' });
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'order-real' });
    mockedPrisma.sCOrderAnalysis.create.mockResolvedValue({ id: 'anal-1' });
  });

  it('rejects a non-existent projectId with 400 (not 500 FK crash)', async () => {
    mockedPrisma.project.findUnique.mockResolvedValue(null);
    await expect(
      scNlpService.analyseOrder('u1', { text: 'Đơn hàng mới PO-1', projectId: 'proj-ghost' })
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('rejects a non-existent orderId with 400', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue(null);
    await expect(
      scNlpService.analyseOrder('u1', { text: 'Đơn hàng mới PO-1', orderId: 'order-ghost' })
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('accepts valid projectId + orderId and creates analysis', async () => {
    const result = await scNlpService.analyseOrder('u1', {
      text: 'Đơn hàng mới PO-1',
      projectId: 'proj-real',
      orderId: 'order-real',
    });
    expect(result).toBeDefined();
    expect(mockedPrisma.sCOrderAnalysis.create).toHaveBeenCalledTimes(1);
  });

  it('accepts request without projectId/orderId (no FK check)', async () => {
    const result = await scNlpService.analyseOrder('u1', { text: 'Văn bản lạ' });
    expect(result).toBeDefined();
    expect(mockedPrisma.sCOrderAnalysis.create).toHaveBeenCalledTimes(1);
  });

  it('throws AppError (not Prisma FK error) so the error handler returns 400', async () => {
    mockedPrisma.project.findUnique.mockResolvedValue(null);
    await expect(
      scNlpService.analyseOrder('u1', { text: 'x', projectId: 'ghost' })
    ).rejects.toBeInstanceOf(AppError);
  });
});
