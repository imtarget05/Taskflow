/**
 * Deterministic similarity primitives for the agent evaluation / accuracy
 * framework (Phase 3). These are pure, unit-tested helpers so relevance can be
 * measured WITHOUT a live embedding service; production callers can feed real
 * model embeddings in. They also underpin the offline eval harness
 * (`tests/eval/accuracy-report.test.ts`).
 */

/** L2 (Euclidean) norm of a numeric vector. */
export function l2Norm(vec: number[]): number {
  return Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
}

/** Dot product over the shortest common length (vector widths may differ). */
export function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < len; i++) d += a[i] * b[i];
  return d;
}

/**
 * Cosine similarity in [-1, 1]. Zero-vector inputs yield 0 (no measurable
 * overlap rather than an undefined NaN). Shared by evaluation scoring and
 * recommendation matching.
 * uses with pgvector (`1 - (embedding <=> ...)`), kept here for eval checks.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const na = l2Norm(a);
  const nb = l2Norm(b);
  if (na === 0 || nb === 0) return 0;
  return dotProduct(a, b) / (na * nb);
}

/** Lowercase tokenizer that keeps diacritics (\p{L}/\p{N} Unicode-aware). */
export function tokenize(text: string): string[] {
  return String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Token-overlap cosine relevance between two strings, over a shared
 * bag-of-words vocabulary. Offline stand-in for embedding-based relevance when
 * no embedding service is available in CI.
 */
export function tokenRelevance(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const vocab = Array.from(new Set([...ta, ...tb])).sort();
  const index = new Map(vocab.map((w, i) => [w, i]));
  const va = new Array(vocab.length).fill(0);
  const vb = new Array(vocab.length).fill(0);
  for (const w of ta) va[index.get(w)!]++;
  for (const w of tb) vb[index.get(w)!]++;
  return cosineSimilarity(va, vb);
}