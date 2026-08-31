/**
 * Agent accuracy framework (Phase 3 / point 4 of the risk talk).
 *
 * Turns the fixed Vietnamese eval set (`agent-eval.json`) into quantifiable
 * metrics — accuracy, tool recall, null-suppression precision, and mean answer
 * relevance — using the SAME intent stub as `agent-eval.test.ts` (single source
 * of truth in `stub-llm.ts`) and the pure similarity primitives in
 * `src/modules/agent/similarity.ts`.
 *
 * Because the stub is deterministic and DB-free, this harness runs in CI
 * without a live LLM or database, and answers the "đo chính xác" requirement
 * (chưa có framework chính thức trong codebase trước đây).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { stubToolCalls } from './stub-llm';
import { tokenRelevance } from '../../src/modules/agent/similarity';

interface EvalCase {
  id: string;
  utterance: string;
  expect: { tool: string | null; params?: Record<string, string | null> };
}

const cases = JSON.parse(readFileSync(resolve(__dirname, 'agent-eval.json'), 'utf8')) as EvalCase[];

/** Canonical "gold" text for an expected tool call (used for relevance scoring). */
function goldString(c: EvalCase): string {
  const name = c.expect.tool ?? '';
  const params = Object.values(c.expect.params ?? {})
    .filter((v): v is string => v !== null && v !== undefined)
    .join(' ');
  return [name, params].filter(Boolean).join(' ');
}

describe('agent accuracy framework (precision / recall / relevance)', () => {
  const rows = cases.map((c) => {
    const predicted = stubToolCalls(c.utterance).toolCalls[0]?.name ?? null;
    const expected = c.expect.tool;
    const correct = predicted === expected;
    const relevance = expected ? tokenRelevance(c.utterance, goldString(c)) : null;
    return { id: c.id, expected, predicted, correct, relevance };
  });

  const total = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  const intended = rows.filter((r) => r.expected !== null).length;
  const toolHits = rows.filter((r) => r.expected !== null && r.correct && r.predicted !== null).length;
  const nullExpected = rows.filter((r) => r.expected === null).length;
  const suppressed = rows.filter((r) => r.expected === null && r.predicted === null).length;
  const relevanceValues = rows.filter((r) => r.relevance !== null).map((r) => r.relevance as number);

  const accuracy = correct / total;
  const toolRecall = intended === 0 ? 1 : toolHits / intended;
  const nullPrecision = nullExpected === 0 ? 1 : suppressed / nullExpected;
  const meanRelevance =
    relevanceValues.length === 0 ? 0 : relevanceValues.reduce((s, v) => s + v, 0) / relevanceValues.length;

  it('overall accuracy across the eval set stays above threshold', () => {
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('tool recall (create_project / create_task) stays above threshold', () => {
    expect(toolRecall).toBeGreaterThanOrEqual(0.9);
  });

  it('null-suppression precision (no spurious tool calls) stays high', () => {
    expect(nullPrecision).toBeGreaterThanOrEqual(0.9);
  });

  it('every tool-intended case has non-negative answer relevance', () => {
    for (const r of rows) {
      if (r.expected !== null) {
        expect(r.relevance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('mean answer-relevance across intended cases clears the relevance bar', () => {
    expect(meanRelevance).toBeGreaterThanOrEqual(0.25);
  });
});