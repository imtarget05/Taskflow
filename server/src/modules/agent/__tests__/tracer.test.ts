// Mock the langfuse SDK so the unit test runs under Jest's CommonJS runtime
// (langfuse v3 uses ESM dynamic import which Jest CJS cannot load). We test
// the wrapper's gating + span wiring, not the SDK transport itself.
jest.mock('langfuse', () => {
  class Langfuse {
    trace = jest.fn(() => ({
      span: jest.fn(() => ({ update: jest.fn(), end: jest.fn() })),
      update: jest.fn(),
    }));
  }
  return { Langfuse };
});

import { getTracer, isLangfuseEnabled, traceAgentTurn } from '../tracer';

describe('agent tracer', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.clearAllMocks();
  });

  it('is disabled (no-op) when LANGFUSE keys are absent', () => {
    expect(isLangfuseEnabled()).toBe(false);
    expect(getTracer()).toBeUndefined();
    expect(() =>
      traceAgentTurn({ userId: 'u1', conversationId: 'c1', userMessage: 'hi' }, () => undefined)
    ).not.toThrow();
  });

  it('enables tracing and records spans when keys are present', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';

    expect(isLangfuseEnabled()).toBe(true);
    const t = getTracer();
    expect(t).toBeDefined();

    const output = traceAgentTurn(
      { userId: 'u1', conversationId: 'c1', userMessage: 'tạo board ABC' },
      (trace) => {
        const s = trace!.span({ name: 'guardrail' });
        s.update({ output: { decision: 'accepted' } });
        s.end();
        return 42;
      }
    );
    expect(output).toBe(42);
  });

  it('names the trace from the conversation id and tags the user', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    const t = getTracer()!;
    traceAgentTurn({ userId: 'u7', conversationId: 'conv-9', userMessage: 'x' }, () => undefined);
    expect(t.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conv-9',
        name: 'agent-turn',
        userId: 'u7',
        input: { message: 'x' },
      })
    );
  });
});
