/**
 * Ragas-like evaluation metrics for TaskFlow LLM outputs.
 *
 * Pure, deterministic functions — no DB, no LLM. Token-overlap heuristics
 * stand in for the full Ragas pipeline so CI can assert metric bounds without
 * a live embedding service. Production callers can swap in model-based scores
 * later without changing the interface.
 */

export interface RagasMetrics {
  faithfulness: number;      // How factually grounded is the answer?
  answerRelevancy: number;   // How relevant is the answer to the question?
  contextRecall: number;     // Did we retrieve all relevant context?
  contextPrecision: number;  // Is retrieved context actually relevant?
}

/**
 * Unicode-aware tokenizer. Keeps diacritics (Vietnamese text).
 */
export function tokenize(text: string): string[] {
  return String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Faithfulness: fraction of answer tokens covered by context.
 * 1.0 means every answer token appears in context (fully grounded).
 * Lower when the answer introduces tokens not in context (hallucination signal).
 */
export function computeFaithfulness(answer: string, context: string[]): number {
  const answerTokens = new Set(tokenize(answer));
  if (answerTokens.size === 0) return 1.0;
  const contextTokens = new Set(context.flatMap((c) => tokenize(c)));
  let supported = 0;
  for (const token of answerTokens) {
    if (contextTokens.has(token)) supported++;
  }
  return supported / answerTokens.size;
}

/**
 * Answer relevancy: fraction of answer tokens that also appear in the question.
 * High when the answer stays on-topic; low when it drifts.
 */
export function computeAnswerRelevancy(answer: string, question: string): number {
  const answerTokens = new Set(tokenize(answer));
  if (answerTokens.size === 0) return 0;
  const questionTokens = new Set(tokenize(question));
  let relevant = 0;
  for (const token of answerTokens) {
    if (questionTokens.has(token)) relevant++;
  }
  return relevant / answerTokens.size;
}

/**
 * Context recall: fraction of question tokens covered by the retrieved context.
 * 1.0 means the context contains every question token (nothing missed).
 */
export function computeContextRecall(question: string, context: string[]): number {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0) return 1.0;
  const contextTokens = new Set(context.flatMap((c) => tokenize(c)));
  let covered = 0;
  for (const token of questionTokens) {
    if (contextTokens.has(token)) covered++;
  }
  return covered / questionTokens.size;
}

/**
 * Context precision: fraction of context tokens that are question-relevant.
 * High when retrieved context is tight and on-topic; low when noisy.
 */
export function computeContextPrecision(context: string[], question: string): number {
  const contextTokens = context.flatMap((c) => tokenize(c));
  if (contextTokens.length === 0) return 0;
  const questionTokens = new Set(tokenize(question));
  let relevant = 0;
  for (const token of contextTokens) {
    if (questionTokens.has(token)) relevant++;
  }
  return relevant / contextTokens.length;
}

/**
 * Compute all four Ragas metrics at once.
 */
export function computeRagasMetrics(
  question: string,
  answer: string,
  context: string[],
): RagasMetrics {
  return {
    faithfulness: computeFaithfulness(answer, context),
    answerRelevancy: computeAnswerRelevancy(answer, question),
    contextRecall: computeContextRecall(question, context),
    contextPrecision: computeContextPrecision(context, question),
  };
}

/**
 * Clamp a metric into [0, 1] to guard against floating-point drift.
 */
export function clampMetric(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
