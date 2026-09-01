/**
 * Evaluator service — orchestrates Ragas-like evaluation runs against
 * TaskFlow LLM outputs. Persists results to EvaluationRun for historical
 * comparison (A/B prompt/model/config experiments).
 */
import { prisma } from '../../lib/prisma';
import {
  RagasMetrics,
  computeRagasMetrics,
  clampMetric,
} from './metrics';

export interface EvaluationInput {
  question: string;
  answer: string;
  context: string[];
  /** Optional gold-standard accuracy (e.g. from human-labeled eval set). */
  accuracy?: number;
}

export interface EvaluationResult {
  name: string;
  promptVersion: string | null;
  datasetSize: number;
  metrics: RagasMetrics & { accuracy?: number };
  config: Record<string, unknown> | null;
}

export interface ComparisonResult {
  runA: { name: string; metrics: RagasMetrics & { accuracy?: number } };
  runB: { name: string; metrics: RagasMetrics & { accuracy?: number } };
  delta: Record<string, number>;
}

/**
 * Evaluate a single Q&A pair with Ragas metrics.
 * Stateless — no DB write. Caller decides whether to persist.
 */
export function evaluateRagas(input: EvaluationInput): RagasMetrics {
  return computeRagasMetrics(input.question, input.answer, input.context);
}

/**
 * Run a full evaluation batch and persist the aggregate.
 * Each item contributes equally to the averaged metrics.
 */
export async function runEvaluation(
  name: string,
  items: EvaluationInput[],
  config: Record<string, unknown> | null = null,
  promptVersion: string | null = null,
): Promise<EvaluationResult> {
  if (items.length === 0) {
    return {
      name,
      promptVersion,
      datasetSize: 0,
      metrics: { faithfulness: 0, answerRelevancy: 0, contextRecall: 0, contextPrecision: 0 },
      config,
    };
  }

  let faithfulness = 0;
  let answerRelevancy = 0;
  let contextRecall = 0;
  let contextPrecision = 0;
  let accuracySum = 0;
  let accuracyCount = 0;

  for (const item of items) {
    const m = evaluateRagas(item);
    faithfulness += m.faithfulness;
    answerRelevancy += m.answerRelevancy;
    contextRecall += m.contextRecall;
    contextPrecision += m.contextPrecision;
    if (item.accuracy !== undefined) {
      accuracySum += item.accuracy;
      accuracyCount++;
    }
  }

  const n = items.length;
  const metrics: RagasMetrics & { accuracy?: number } = {
    faithfulness: clampMetric(faithfulness / n),
    answerRelevancy: clampMetric(answerRelevancy / n),
    contextRecall: clampMetric(contextRecall / n),
    contextPrecision: clampMetric(contextPrecision / n),
  };
  if (accuracyCount > 0) {
    metrics.accuracy = clampMetric(accuracySum / accuracyCount);
  }

  await prisma.evaluationRun.create({
    data: {
      name,
      promptVersion,
      datasetSize: n,
      metrics: metrics as unknown as object,
      config: (config ?? undefined) as object | undefined,
    },
  });

  return { name, promptVersion, datasetSize: n, metrics, config };
}

/**
 * Compare two past evaluation runs by ID. Returns per-metric deltas.
 */
export async function compareRuns(runIdA: string, runIdB: string): Promise<ComparisonResult> {
  const [a, b] = await Promise.all([
    prisma.evaluationRun.findUnique({ where: { id: runIdA } }),
    prisma.evaluationRun.findUnique({ where: { id: runIdB } }),
  ]);

  if (!a || !b) {
    const err = new Error('Evaluation run not found');
    throw Object.assign(err, { statusCode: 404 });
  }

  const mA = a.metrics as unknown as RagasMetrics & { accuracy?: number };
  const mB = b.metrics as unknown as RagasMetrics & { accuracy?: number };
  const delta: Record<string, number> = {};
  for (const key of ['faithfulness', 'answerRelevancy', 'contextRecall', 'contextPrecision', 'accuracy'] as const) {
    if (mA[key] !== undefined && mB[key] !== undefined) {
      delta[key] = Math.round(((mB[key]! - mA[key]!) + Number.EPSILON) * 1e4) / 1e4;
    }
  }

  return {
    runA: { name: a.name, metrics: mA },
    runB: { name: b.name, metrics: mB },
    delta,
  };
}

/**
 * List past evaluation runs, newest first.
 */
export async function getEvaluationHistory(limit = 20) {
  return prisma.evaluationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
