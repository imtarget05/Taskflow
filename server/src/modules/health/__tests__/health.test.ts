// Mock prisma — $queryRaw is typed as never in Prisma, so we cast.
const mockQueryRaw = jest.fn() as jest.Mock;
jest.mock('../../../lib/prisma', () => ({
  prisma: { $queryRaw: (...args: any[]) => mockQueryRaw(...args) },
}));

// Mock env
jest.mock('../../../config/env', () => ({
  env: { LLM_PROVIDER: 'ollama' },
  isEmailConfigured: jest.fn().mockReturnValue(false),
}));

// Mock LLM
jest.mock('../../agent/llm', () => ({
  isLLMConfigured: jest.fn().mockReturnValue(true),
}));

// Mock email service
jest.mock('../../auth/email.service', () => ({
  verifyEmailConnection: jest.fn().mockResolvedValue(true),
}));

import { healthRouter } from '../health.controller';
import { isLLMConfigured } from '../../agent/llm';

function createMockResponse(): any {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

// Find the GET / handler from the Express router stack.
function getHandler() {
  const layer = (healthRouter as any).stack.find(
    (l: any) => l.route?.path === '/' && l.route?.stack?.[0]?.method === 'get'
  );
  return layer?.route?.stack?.[0]?.handle;
}

describe('healthController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
    jest.spyOn(process, 'uptime').mockReturnValue(125);
    // Default: LLM configured. Override per-test as needed.
    (isLLMConfigured as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockQueryRaw.mockReset();
  });

  it('returns healthy when DB up and LLM configured', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const req = {} as any;
    const res = createMockResponse();

    await getHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: 'healthy',
        uptime: 125,
        version: expect.any(String),
        dependencies: expect.objectContaining({
          database: expect.objectContaining({ status: 'up', responseMs: expect.any(Number) }),
          llm: expect.objectContaining({ status: 'configured', provider: 'ollama' }),
        }),
      })
    );
  });

  it('returns degraded when DB up but LLM unconfigured', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    (isLLMConfigured as jest.Mock).mockReturnValue(false);

    const req = {} as any;
    const res = createMockResponse();

    await getHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: 'degraded',
        dependencies: expect.objectContaining({
          database: expect.objectContaining({ status: 'up' }),
          llm: expect.objectContaining({ status: 'unconfigured' }),
        }),
      })
    );
  });

  it('returns unhealthy (503) when DB down', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const req = {} as any;
    const res = createMockResponse();

    await getHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: 'unhealthy',
        dependencies: expect.objectContaining({
          database: expect.objectContaining({ status: 'down' }),
        }),
      })
    );
  });

  it('returns unhealthy when both DB down and LLM unconfigured', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'));
    (isLLMConfigured as jest.Mock).mockReturnValue(false);

    const req = {} as any;
    const res = createMockResponse();

    await getHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: 'unhealthy',
      })
    );
  });

  it('response structure matches HealthStatus interface', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const req = {} as any;
    const res = createMockResponse();

    await getHandler()(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('dependencies');
    expect(body.dependencies).toHaveProperty('database');
    expect(body.dependencies).toHaveProperty('llm');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(['up', 'down']).toContain(body.dependencies.database.status);
    expect(['configured', 'unconfigured']).toContain(body.dependencies.llm.status);
  });
});
