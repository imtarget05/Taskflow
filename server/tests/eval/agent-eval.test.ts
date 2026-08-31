/**
 * Batch evaluator for the agent module (Phase 3 of the Evaluation & Observability
 * plan). Runs a fixed Vietnamese utterance set through `agent.chat()` with the
 * LLM stubbed, and asserts the agent calls the expected tool (or correctly
 * abstains). Runs under Jest so we reuse the mocking + reporting harness; CI
 * invokes it via `npm run eval:agent` (jest with this file).
 *
 * The intent-detection stub lives in a shared module (`stub-llm.ts`) so the
 * accuracy framework (`accuracy-report.test.ts`) measures the exact same
 * behaviour — no duplication / drift between the two harnesses.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Jest hoists jest.mock factories above imports, so `require` is the only safe
// way to pull the shared stub into the factory body.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../../src/modules/agent/llm', () => require('./stub-llm').makeLlmMock());

jest.mock('../../src/modules/agent/tracer', () => ({
  traceAgentTurn: <T,>(_meta: unknown, run: (t: undefined) => T): T => run(undefined),
  isLangfuseEnabled: () => false,
  getTracer: () => undefined,
  flushTracer: () => Promise.resolve(),
}));

import { chat } from '../../src/modules/agent/agent.service';

interface Case {
  id: string;
  utterance: string;
  expect: { tool: string | null; params?: Record<string, string | null> };
}

const cases = JSON.parse(readFileSync(resolve(__dirname, 'agent-eval.json'), 'utf8')) as Case[];

describe('agent eval set', () => {
  it.each(cases)('$id: "$utterance" → expects tool=$expect.tool', async (c) => {
    const res = await chat('eval-user', [{ role: 'user', content: c.utterance }], { skipPersist: true });
    const tool = res.action?.name ?? null;
    expect(tool).toBe(c.expect.tool);
  });
});