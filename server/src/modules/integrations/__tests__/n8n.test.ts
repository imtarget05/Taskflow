import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from '../../../config/env';

// Mock the env module so we control N8N configuration per test.
vi.mock('../../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    N8N_API_URL: undefined,
    N8N_API_KEY: undefined,
    N8N_SIGNING_SECRET: undefined,
  },
}));

// Mock the logger to keep test output clean.
vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { dispatchToN8n, isN8nConfigured } from '../n8n';

describe('n8n integration client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // reset module-level env between tests
    const e = env;
    e.N8N_API_URL = undefined;
    e.N8N_API_KEY = undefined;
    e.N8N_SIGNING_SECRET = undefined;
  });

  it('isN8nConfigured is false when N8N_API_URL missing', () => {
    expect(isN8nConfigured()).toBe(false);
  });

  it('skips dispatch and returns false when n8n is not configured', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const ok = await dispatchToN8n({
      path: '/webhook/taskflow',
      event: 'agentic.decision',
      payload: { foo: 'bar' },
    });
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('delivers payload to the webhook when configured', async () => {
    const e = env;
    e.N8N_API_URL = 'http://localhost:5678';

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    const ok = await dispatchToN8n({
      path: '/webhook/taskflow',
      event: 'order.transition',
      eventId: 'evt-1',
      payload: { orderId: 'o1', from: 'APPROVED', to: 'IN_FULFILLMENT' },
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:5678/webhook/taskflow');
    const sent = JSON.parse(init!.body as string);
    expect(sent.event).toBe('order.transition');
    expect(sent.eventId).toBe('evt-1');
    expect(sent.data.orderId).toBe('o1');
  });

  it('adds auth header + HMAC signature when configured', async () => {
    env.N8N_API_URL = 'http://localhost:5678';
    env.N8N_API_KEY = 'secret-key';
    env.N8N_SIGNING_SECRET = 'sign-secret';

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    await dispatchToN8n({
      path: '/wh',
      event: 'inventory.adjust',
      payload: { sku: 'A' },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
    expect((init!.headers as Record<string, string>)['X-TaskFlow-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns false (never throws) when the webhook is unreachable', async () => {
    env.N8N_API_URL = 'http://localhost:5678';

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const ok = await dispatchToN8n({
      path: '/wh',
      event: 'sc.order.analysed',
      payload: {},
    });
    expect(ok).toBe(false);
  });
});
