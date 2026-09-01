/**
 * Benchmark report generator for the agent evaluation pipeline.
 *
 * Generates a markdown report with all metrics from the eval set:
 * overall accuracy, tool recall, null-suppression precision, mean relevance,
 * per-category breakdown, robustness score, and latency (mock).
 *
 * Output: server/tests/eval/reports/YYYY-MM-DD.md
 *
 * Run: npm run eval:benchmark
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
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

// Thresholds for pass/fail status.
const THRESHOLDS = {
  accuracy: 0.9,
  toolRecall: 0.9,
  nullPrecision: 0.9,
  meanRelevance: 0.25,
  meanLatencyMs: 100,
  maxLatencyMs: 500,
  categoryAccuracy: 0.85,
  robustness: 0.8,
};

interface Row {
  id: string;
  expected: string | null;
  predicted: string | null;
  correct: boolean;
  relevance: number | null;
  elapsed: number;
  category: 'create_project' | 'create_task' | 'null';
  isEdge: boolean;
}

const rows: Row[] = cases.map((c) => {
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

const latencies = rows.map((r) => r.elapsed);
const meanLatency = latencies.reduce((s, v) => s + v, 0) / latencies.length;
const maxLatency = Math.max(...latencies);

const categories = ['create_project', 'create_task', 'null'] as const;
const perCategory = categories.map((cat) => {
  const catRows = rows.filter((r) => r.category === cat);
  const catCorrect = catRows.filter((r) => r.correct).length;
  return {
    category: cat,
    total: catRows.length,
    correct: catCorrect,
    accuracy: catRows.length === 0 ? 1 : catCorrect / catRows.length,
  };
});

const edgeRows = rows.filter((r) => r.isEdge);
const standardRows = rows.filter((r) => !r.isEdge);
const edgeAccuracy = edgeRows.length === 0 ? 1 : edgeRows.filter((r) => r.correct).length / edgeRows.length;
const standardAccuracy =
  standardRows.length === 0 ? 1 : standardRows.filter((r) => r.correct).length / standardRows.length;

function status(pass: boolean): string {
  return pass ? '✅ PASS' : '❌ FAIL';
}

const today = new Date().toISOString().split('T')[0];

const lines: string[] = [];
lines.push(`# Agent Evaluation Benchmark Report — ${today}`);
lines.push('');
lines.push(`> Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`| Metric | Value | Threshold | Status |`);
lines.push(`|--------|-------|-----------|--------|`);
lines.push(`| Total Cases | ${total} | — | — |`);
lines.push(`| Overall Accuracy | ${(accuracy * 100).toFixed(1)}% | ≥${(THRESHOLDS.accuracy * 100).toFixed(0)}% | ${status(accuracy >= THRESHOLDS.accuracy)} |`);
lines.push(`| Tool Recall | ${(toolRecall * 100).toFixed(1)}% | ≥${(THRESHOLDS.toolRecall * 100).toFixed(0)}% | ${status(toolRecall >= THRESHOLDS.toolRecall)} |`);
lines.push(`| Null-Suppression Precision | ${(nullPrecision * 100).toFixed(1)}% | ≥${(THRESHOLDS.nullPrecision * 100).toFixed(0)}% | ${status(nullPrecision >= THRESHOLDS.nullPrecision)} |`);
lines.push(`| Mean Answer Relevance | ${meanRelevance.toFixed(3)} | ≥${THRESHOLDS.meanRelevance} | ${status(meanRelevance >= THRESHOLDS.meanRelevance)} |`);
lines.push(`| Mean Latency (mock) | ${meanLatency.toFixed(2)}ms | <${THRESHOLDS.meanLatencyMs}ms | ${status(meanLatency < THRESHOLDS.meanLatencyMs)} |`);
lines.push(`| Max Latency (mock) | ${maxLatency}ms | <${THRESHOLDS.maxLatencyMs}ms | ${status(maxLatency < THRESHOLDS.maxLatencyMs)} |`);
lines.push(`| Robustness (edge accuracy) | ${(edgeAccuracy * 100).toFixed(1)}% | ≥${(THRESHOLDS.robustness * 100).toFixed(0)}% | ${status(edgeAccuracy >= THRESHOLDS.robustness)} |`);
lines.push('');

lines.push('## Per-Category Breakdown');
lines.push('');
lines.push(`| Category | Total | Correct | Accuracy | Threshold | Status |`);
lines.push(`|----------|-------|---------|----------|-----------|--------|`);
for (const cat of perCategory) {
  lines.push(
    `| ${cat.category} | ${cat.total} | ${cat.correct} | ${(cat.accuracy * 100).toFixed(1)}% | ≥${(THRESHOLDS.categoryAccuracy * 100).toFixed(0)}% | ${status(cat.accuracy >= THRESHOLDS.categoryAccuracy)} |`
  );
}
lines.push('');

lines.push('## Robustness Analysis');
lines.push('');
lines.push(`| Category | Cases | Correct | Accuracy |`);
lines.push(`|----------|-------|---------|----------|`);
lines.push(`| Edge Cases | ${edgeRows.length} | ${edgeRows.filter((r) => r.correct).length} | ${(edgeAccuracy * 100).toFixed(1)}% |`);
lines.push(`| Standard Cases | ${standardRows.length} | ${standardRows.filter((r) => r.correct).length} | ${(standardAccuracy * 100).toFixed(1)}% |`);
lines.push('');

lines.push('## Per-Case Results');
lines.push('');
lines.push(`| ID | Expected | Predicted | Correct | Category | Edge |`);
lines.push(`|----|----------|-----------|---------|----------|------|`);
for (const r of rows) {
  lines.push(
    `| ${r.id} | ${r.expected ?? 'null'} | ${r.predicted ?? 'null'} | ${r.correct ? '✅' : '❌'} | ${r.category} | ${r.isEdge ? '⚡' : ''} |`
  );
}
lines.push('');

const reportContent = lines.join('\n');

// Write report.
const reportDir = resolve(__dirname, 'reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = resolve(reportDir, `${today}.md`);
writeFileSync(reportPath, reportContent, 'utf8');

console.log(`Benchmark report generated: ${reportPath}`);
console.log(`Total cases: ${total} | Accuracy: ${(accuracy * 100).toFixed(1)}% | Tool Recall: ${(toolRecall * 100).toFixed(1)}%`);
console.log(`Null Precision: ${(nullPrecision * 100).toFixed(1)}% | Mean Relevance: ${meanRelevance.toFixed(3)}`);
console.log(`Robustness: ${(edgeAccuracy * 100).toFixed(1)}% | Mean Latency: ${meanLatency.toFixed(2)}ms`);

// Exit with error code if any threshold fails.
const failures: string[] = [];
if (accuracy < THRESHOLDS.accuracy) failures.push(`accuracy (${(accuracy * 100).toFixed(1)}% < ${THRESHOLDS.accuracy * 100}%)`);
if (toolRecall < THRESHOLDS.toolRecall) failures.push(`tool recall (${(toolRecall * 100).toFixed(1)}% < ${THRESHOLDS.toolRecall * 100}%)`);
if (nullPrecision < THRESHOLDS.nullPrecision) failures.push(`null precision (${(nullPrecision * 100).toFixed(1)}% < ${THRESHOLDS.nullPrecision * 100}%)`);
if (meanRelevance < THRESHOLDS.meanRelevance) failures.push(`mean relevance (${meanRelevance.toFixed(3)} < ${THRESHOLDS.meanRelevance})`);
if (edgeAccuracy < THRESHOLDS.robustness) failures.push(`robustness (${(edgeAccuracy * 100).toFixed(1)}% < ${THRESHOLDS.robustness * 100}%)`);

if (failures.length > 0) {
  console.error(`\n❌ THRESHOLD FAILURES: ${failures.join(', ')}`);
  process.exit(1);
} else {
  console.log('\n✅ All thresholds passed.');
}
