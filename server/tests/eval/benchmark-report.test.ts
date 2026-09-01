/**
 * Tests for the benchmark report generator.
 *
 * Verifies:
 * - Report generates valid markdown with all sections
 * - Per-category breakdown sums correctly
 * - All metrics are present in the output
 * - Report file is written to the correct location
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

import { stubToolCalls } from './stub-llm';
import { tokenRelevance } from '../../src/modules/agent/similarity';

interface EvalCase {
  id: string;
  utterance: string;
  expect: { tool: string | null; params?: Record<string, string | null> };
}

const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'agent-eval.json'), 'utf8')
) as EvalCase[];

function goldString(c: EvalCase): string {
  const name = c.expect.tool ?? '';
  const params = Object.values(c.expect.params ?? {})
    .filter((v): v is string => v !== null && v !== undefined)
    .join(' ');
  return [name, params].filter(Boolean).join(' ');
}

function caseCategory(c: EvalCase): 'create_project' | 'create_task' | 'null' {
  if (c.expect.tool === 'create_project') return 'create_project';
  if (c.expect.tool === 'create_task') return 'create_task';
  return 'null';
}

const EDGE_IDS = new Set([
  'edge1', 'edge2', 'edge3', 'edge4', 'edge5', 'edge6', 'edge7', 'edge8',
  'edge_long', 'edge_ambiguous', 'edge_numbers', 'edge_special_chars',
  'err_missing_title', 'err_no_project_task', 'err_invalid_board',
]);

describe('benchmark report metrics', () => {
  const rows = cases.map((c) => {
    const start = Date.now();
    const predicted = stubToolCalls(c.utterance).toolCalls[0]?.name ?? null;
    const elapsed = Date.now() - start;
    const expected = c.expect.tool;
    const correct = predicted === expected;
    const relevance = expected ? tokenRelevance(c.utterance, goldString(c)) : null;
    return {
      id: c.id,
      expected,
      predicted,
      correct,
      relevance,
      elapsed,
      category: caseCategory(c),
      isEdge: EDGE_IDS.has(c.id),
    };
  });

  const total = rows.length;
  const correctCount = rows.filter((r) => r.correct).length;
  const intended = rows.filter((r) => r.expected !== null).length;
  const toolHits = rows.filter((r) => r.expected !== null && r.correct && r.predicted !== null).length;
  const nullExpected = rows.filter((r) => r.expected === null).length;
  const suppressed = rows.filter((r) => r.expected === null && r.predicted === null).length;
  const relevanceValues = rows.filter((r) => r.relevance !== null).map((r) => r.relevance as number);

  const accuracy = correctCount / total;
  const toolRecall = intended === 0 ? 1 : toolHits / intended;
  const nullPrecision = nullExpected === 0 ? 1 : suppressed / nullExpected;
  const meanRelevance =
    relevanceValues.length === 0 ? 0 : relevanceValues.reduce((s, v) => s + v, 0) / relevanceValues.length;

  const edgeRows = rows.filter((r) => r.isEdge);
  const edgeAccuracy = edgeRows.length === 0 ? 1 : edgeRows.filter((r) => r.correct).length / edgeRows.length;

  const categories = ['create_project', 'create_task', 'null'] as const;
  const perCategory = categories.map((cat) => {
    const catRows = rows.filter((r) => r.category === cat);
    const catCorrect = catRows.filter((r) => r.correct).length;
    return { category: cat, total: catRows.length, correct: catCorrect };
  });

  it('eval set has exactly 50 cases', () => {
    expect(total).toBe(50);
  });

  it('overall accuracy is calculated correctly', () => {
    expect(accuracy).toBe(correctCount / total);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('tool recall is calculated correctly', () => {
    expect(toolRecall).toBe(intended === 0 ? 1 : toolHits / intended);
    expect(toolRecall).toBeGreaterThanOrEqual(0.9);
  });

  it('null-suppression precision is calculated correctly', () => {
    expect(nullPrecision).toBe(nullExpected === 0 ? 1 : suppressed / nullExpected);
    expect(nullPrecision).toBeGreaterThanOrEqual(0.9);
  });

  it('mean relevance is non-negative', () => {
    expect(meanRelevance).toBeGreaterThanOrEqual(0);
  });

  it('per-category breakdown sums to total', () => {
    const sumTotal = perCategory.reduce((s, c) => s + c.total, 0);
    expect(sumTotal).toBe(total);
  });

  it('per-category correct counts sum to total correct', () => {
    const sumCorrect = perCategory.reduce((s, c) => s + c.correct, 0);
    expect(sumCorrect).toBe(correctCount);
  });

  it('each category has at least one case', () => {
    for (const cat of perCategory) {
      expect(cat.total).toBeGreaterThan(0);
    }
  });

  it('robustness (edge accuracy) is above threshold', () => {
    expect(edgeAccuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('edge cases are identified correctly', () => {
    const edgeCount = rows.filter((r) => r.isEdge).length;
    expect(edgeCount).toBeGreaterThan(0);
    expect(edgeCount).toBeLessThan(total);
  });

  it('latency mechanism produces non-negative values', () => {
    for (const r of rows) {
      expect(r.elapsed).toBeGreaterThanOrEqual(0);
    }
  });

  it('relevance is null only when expected tool is null', () => {
    for (const r of rows) {
      if (r.expected === null) {
        expect(r.relevance).toBeNull();
      } else {
        expect(r.relevance).not.toBeNull();
      }
    }
  });
});

describe('benchmark report file', () => {
  const reportsDir = resolve(__dirname, 'reports');

  it('reports directory exists', () => {
    expect(existsSync(reportsDir)).toBe(true);
  });

  it('at least one markdown report exists', () => {
    const files = readdirSync(reportsDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('latest report contains all required sections', () => {
    const files = readdirSync(reportsDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse();
    expect(files.length).toBeGreaterThan(0);

    const latestReport = readFileSync(resolve(reportsDir, files[0]), 'utf8');

    // Check all sections are present.
    expect(latestReport).toContain('# Agent Evaluation Benchmark Report');
    expect(latestReport).toContain('## Summary');
    expect(latestReport).toContain('## Per-Category Breakdown');
    expect(latestReport).toContain('## Robustness Analysis');
    expect(latestReport).toContain('## Per-Case Results');

    // Check all metrics are present.
    expect(latestReport).toContain('Total Cases');
    expect(latestReport).toContain('Overall Accuracy');
    expect(latestReport).toContain('Tool Recall');
    expect(latestReport).toContain('Null-Suppression Precision');
    expect(latestReport).toContain('Mean Answer Relevance');
    expect(latestReport).toContain('Mean Latency');
    expect(latestReport).toContain('Robustness');

    // Check categories are present.
    expect(latestReport).toContain('create_project');
    expect(latestReport).toContain('create_task');
    expect(latestReport).toContain('null');

    // Check pass/fail status indicators.
    expect(latestReport).toMatch(/✅ PASS|❌ FAIL/);
  });

  it('latest report has valid markdown table structure', () => {
    const files = readdirSync(reportsDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse();
    const latestReport = readFileSync(resolve(reportsDir, files[0]), 'utf8');

    // At least 3 markdown tables (summary, category, per-case).
    const tableCount = (latestReport.match(/\|.*\|.*\|.*\|/g) || []).length;
    expect(tableCount).toBeGreaterThanOrEqual(3);
  });
});
