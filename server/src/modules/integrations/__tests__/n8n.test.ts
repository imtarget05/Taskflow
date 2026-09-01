import { describe, it, expect, jest, afterEach } from '@jest/globals';

// Mock the env module so we control N8N configuration per test.
jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    N8N_API_URL: undefined,
    N8N_API_KEY: undefined,
    N8N_SIGNING_SECRET: undefined,
  },
}));

// Mock the logger to keep test output clean.
jest.mock('../../../lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { dispatchToN8n, isN8nConfigured, N8nEvent } from '../n8n';
import { env } from '../../../config/env';

describe('n8n integration client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    env.N8N_API_URL = undefined;
    env.N8N_API_KEY = undefined;
    env.N8N_SIGNING_SECRET = undefined;
  });

  it('isN8nConfigured is false when N8N_API_URL missing', () => {
    expect(isN8nConfigured()).toBe(false);
  });

  it('skips dispatch and returns false when n8n is not configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const ok = await dispatchToN8n({
      path: '/webhook/taskflow',
      event: 'agentic.decision',
      payload: { foo: 'bar' },
    });
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('delivers payload to the webhook when configured', async () => {
    env.N8N_API_URL = 'http://localhost:5678';
    const fetchSpy = jest
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

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    await dispatchToN8n({ path: '/wh', event: 'inventory.adjust', payload: { sku: 'A' } });

    const [, init] = fetchSpy.mock.calls[0];
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
    expect((init!.headers as Record<string, string>)['X-TaskFlow-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns false (never throws) when the webhook is unreachable', async () => {
    env.N8N_API_URL = 'http://localhost:5678';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const ok = await dispatchToN8n({ path: '/wh', event: 'sc.order.analysed', payload: {} });
    expect(ok).toBe(false);
  });

  it('delivers all 4 event types with correct payload structure', async () => {
    env.N8N_API_URL = 'http://localhost:5678';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    const events: N8nEvent[] = ['agentic.decision', 'order.transition', 'inventory.adjust', 'sc.order.analysed'];

    for (const event of events) {
      await dispatchToN8n({ path: '/webhook', event, payload: { test: event } });
    }

    expect(fetchSpy).toHaveBeenCalledTimes(4);

    const calls = fetchSpy.mock.calls;
    for (let i = 0; i < events.length; i++) {
      const body = JSON.parse(calls[i][1]!.body as string);
      expect(body.event).toBe(events[i]);
      expect(body.eventId).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.data.test).toBe(events[i]);
    }
  });

  it('retries on 500 error then succeeds', async () => {
    jest.useFakeTimers();
    env.N8N_API_URL = 'http://localhost:5678';
    let callCount = 0;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ ok: false, status: 500 } as unknown as Response);
        }
        return Promise.resolve({ ok: true, status: 200 } as unknown as Response);
      });

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const promise = dispatchToN8n({ path: '/webhook', event: 'agentic.decision', payload: {} });

    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);

    const ok = await promise;

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns false after exhausting all retries', async () => {
    jest.useFakeTimers();
    env.N8N_API_URL = 'http://localhost:5678';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const promise = dispatchToN8n({ path: '/webhook', event: 'order.transition', payload: {} });

    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);

    const ok = await promise;

    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(4);

    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it('generates unique eventId when not provided', async () => {
    env.N8N_API_URL = 'http://localhost:5678';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    let ts = 1700000000000;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => ts++);

    await dispatchToN8n({ path: '/webhook', event: 'inventory.adjust', payload: {} });
    await dispatchToN8n({ path: '/webhook', event: 'inventory.adjust', payload: {} });

    const body1 = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    const body2 = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);

    expect(body1.eventId).not.toBe(body2.eventId);

    dateSpy.mockRestore();
  });
});
