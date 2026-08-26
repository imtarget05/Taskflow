import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { chatCompletion, embed, isLLMConfigured } from '../agent/llm';
import { resolveLanguage } from '../agent/language';

// ---------------------------------------------------------------------------
// NLP ticket classification — deeply integrated into the existing TypeScript
// stack (no Python microservice). It reuses the same LLM client as the agent:
//   - chatCompletion   → produce a structured category / priority / sentiment
//   - embed (BGE-M3)   → semantic duplicate detection (cosine similarity)
// The Vietnamese-first language detection (modules/agent/language) is reused
// so the response text / labels respect the user's language.
// ---------------------------------------------------------------------------

export interface TicketClassification {
  category: string;
  categoryConfidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  priorityConfidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: boolean;
  language: string; // vi | en | zh
  keywords: string[];
}

export interface AnalyseOptions {
  userId: string;
  projectId?: string | null;
  taskId?: string | null;
  /** Previous analyses to check for semantic duplicates (embedding cosine). */
  candidates?: string[];
  duplicateThreshold?: number;
}

export interface AnalyseResult extends TicketClassification {
  id: string;
  textLength: number;
  duplicateOf: string | null;
  duplicateScore: number | null;
  createdAt: string;
}

const MAX_TEXT_LENGTH = 4000;

const CATEGORY_LABELS_VI = [
  'đăng nhập / tài khoản',
  'thanh toán / hoàn tiền',
  'kỹ thuật / lỗi hệ thống',
  'yêu cầu tính năng',
  'dữ liệu / báo cáo',
  'hợp đồng / pháp lý',
  'khác',
] as const;

function normalizeCategory(raw: string): string {
  const r = raw.trim().toLowerCase();
  if (!r) return 'khác';
  for (const label of CATEGORY_LABELS_VI) {
    if (label === r || label.includes(r) || r.includes(label.split(' / ')[0])) return label;
  }
  return r.slice(0, 60);
}

function normalizePriority(raw: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  const p = raw.trim().toUpperCase();
  if (p === 'LOW' || p === 'MEDIUM' || p === 'HIGH' || p === 'URGENT') return p;
  if (p.includes('URG') || p.includes('NGAY') || p.includes('GẤP') || p.includes('KHẨN')) return 'URGENT';
  if (p.includes('HIGH') || p.includes('CAO')) return 'HIGH';
  if (p.includes('LOW') || p.includes('THẤP')) return 'LOW';
  return 'MEDIUM';
}

function normalizeSentiment(raw: string): 'positive' | 'neutral' | 'negative' {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('pos') || s.includes('tích cực') || s.includes('hài lòng')) return 'positive';
  if (s.startsWith('neg') || s.includes('tiêu cực') || s.includes('tức') || s.includes('phàn nàn')) return 'negative';
  return 'neutral';
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Locate the first candidate semantically equivalent to `text` using embeddings
 * (returns its index and cosine score). Threshold between 0..1.
 */
export async function findDuplicateIndex(
  text: string,
  candidates: string[],
  threshold = 0.86
): Promise<{ index: number; score: number } | null> {
  if (candidates.length === 0) return null;
  const texts = [text, ...candidates];
  const vectors = await embed(texts);
  const query = vectors[0];
  let best = -1;
  let bestScore = -1;
  candidates.forEach((_, i) => {
    const s = cosineSimilarity(query, vectors[i + 1]);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  if (best < 0 || bestScore < threshold) return null;
  return { index: best, score: bestScore };
}

/** Best-effort JSON extraction from the model's free-form reply. */
function extractJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
interface RawClassification {
  category?: unknown;
  categoryConfidence?: unknown;
  priority?: unknown;
  priorityConfidence?: unknown;
  sentiment?: unknown;
  urgency?: unknown;
  keywords?: unknown;
}

function coerceClassification(x: RawClassification | null | undefined, text: string): TicketClassification {
  const base = keywordFallback(text);
  if (!x) return base;
  return {
    category: normalizeCategory(typeof x.category === 'string' ? x.category : base.category),
    categoryConfidence: clamp01(Number(x.categoryConfidence ?? base.categoryConfidence)),
    priority: normalizePriority(typeof x.priority === 'string' ? x.priority : base.priority),
    priorityConfidence: clamp01(Number(x.priorityConfidence ?? base.priorityConfidence)),
    sentiment: normalizeSentiment(typeof x.sentiment === 'string' ? x.sentiment : base.sentiment),
    urgency: x.urgency === true,
    language: resolveLanguage([text]),
    keywords: keywordList(x.keywords).length > 0 ? keywordList(x.keywords) : base.keywords,
  };
}

/** Extract a string[] from an unknown JSON value (never throws). */
function keywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const k of value) {
    if (typeof k === 'string' && k.trim() && out.length < 8) out.push(k.trim());
  }
  return out;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Classify a piece of text (ticket / task / comment) into category, priority
 * and sentiment via the existing LLM, then persist the result and detect a
 * semantic duplicate against optional previous texts.
 */
export async function analyseText(text: string, options: AnalyseOptions): Promise<AnalyseResult> {
  if (!isLLMConfigured()) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }
  const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!trimmed) {
    throw new AppError('No text provided', StatusCodes.BAD_REQUEST);
  }

  const language = resolveLanguage([trimmed]);
  const langHint =
    language === 'vi'
      ? 'Người dùng viết tiếng Việt (tiếng Việt là ngôn ngữ ưu tiên của sản phẩm).'
      : language === 'zh'
      ? 'Người dùng viết tiếng Trung.'
      : 'Người dùng viết tiếng Anh.';

  const prompt = `Bạn là bộ phân loại ticket tự động. Phân tích đoạn văn bản sau của khách hàng và trả về MỘT đối tượng JSON duy nhất, không kèm văn bản ngoài, đúng định dạng:

{
  "category": "<1 trong: đăng nhập / tài khoản | thanh toán / hoàn tiền | kỹ thuật / lỗi hệ thống | yêu cầu tính năng | dữ liệu / báo cáo | hợp đồng / pháp lý | khác>",
  "categoryConfidence": <0.0-1.0>,
  "priority": "<LOW | MEDIUM | HIGH | URGENT>",
  "priorityConfidence": <0.0-1.0>,
  "sentiment": "<positive | neutral | negative>",
  "urgency": <true|false>,
  "keywords": ["<từ khóa chính 2-5 mục>"]
}

${langHint}
Hãy ưu tiên các từ khóa như: mật khẩu, đăng nhập, tài khoản, OTP, thanh toán, thẻ, hoàn tiền, lỗi, gấp, khẩn, báo lỗi, tính năng.

VĂN BẢN:
"""
${trimmed}
"""`;

  let parsed: RawClassification | null = null;
  try {
    const reply = await chatCompletion([{ role: 'user', content: prompt }], { temperature: 0.1 });
    parsed = extractJson<RawClassification>(reply);
  } catch {
    // Fall through to a keyword-based heuristic so the feature degrades
    // gracefully when the LLM is unreachable.
  }

  const classification = coerceClassification(parsed, trimmed);

  // Semantic duplicate detection (embedding cosine) against previous texts.
  let duplicateOf: string | null = null;
  let duplicateScore: number | null = null;
  if (options.candidates && options.candidates.length > 0) {
    try {
      const dup = await findDuplicateIndex(
        trimmed,
        options.candidates.slice(0, 20),
        options.duplicateThreshold
      );
      if (dup) {
        duplicateScore = Number(dup.score.toFixed(3));
        const prior = await prisma.ticketAnalysis.findFirst({
          where: { userId: options.userId, sourceText: options.candidates[dup.index] },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        duplicateOf = prior?.id ?? null;
      }
    } catch {
      // duplicate detection is best-effort
    }
  }

  const record = await prisma.ticketAnalysis.create({
    data: {
      userId: options.userId,
      projectId: options.projectId ?? null,
      taskId: options.taskId ?? null,
      sourceText: trimmed,
      category: classification.category,
      categoryConfidence: classification.categoryConfidence,
      priority: classification.priority,
      priorityConfidence: classification.priorityConfidence,
      sentiment: classification.sentiment,
      urgency: classification.urgency,
      language: classification.language,
      keywords: keywordList(classification.keywords) as Prisma.InputJsonValue,
      duplicateOf,
      duplicateScore,
    },
  });

  return {
    id: record.id,
    textLength: trimmed.length,
    ...classification,
    duplicateOf,
    duplicateScore,
    createdAt: record.createdAt.toISOString(),
  };
}


/** Deterministic fallback used when the LLM call fails. */
export function keywordFallback(text: string): TicketClassification {
  const lower = text.toLowerCase();
  const hasPayment = /(thanh toán|hoàn tiền|thẻ|payment|refund|trừ tiền)/i.test(lower);
  const hasAuth = /(đăng nhập|tài khoản|mật khẩu|otp|account|login|password)/i.test(lower);
  const hasFeat = /(tính năng|feature|muốn|mong muốn|đề xuất)/i.test(lower);
  const hasTech = /(lỗi|bug|crash|báo lỗi|error|hệ thống)/i.test(lower);
  const hasUrgent = /(gấp|khẩn|ngay|urgent|asap|nhanh|không vào được|không đăng nhập)/i.test(lower);

  let category = 'khác';
  if (hasPayment) category = 'thanh toán / hoàn tiền';
  else if (hasAuth) category = 'đăng nhập / tài khoản';
  else if (hasFeat) category = 'yêu cầu tính năng';
  else if (hasTech) category = 'kỹ thuật / lỗi hệ thống';

  const sentiment = /(không được|không vào|lỗi|trừ tiền|phàn nàn|tệ|chậm|thất vọng)/i.test(lower)
    ? 'negative'
    : /(cảm ơn|tuyệt|tốt|ok)/i.test(lower)
    ? 'positive'
    : 'neutral';

  const priority = hasUrgent
    ? hasPayment || hasAuth
      ? 'URGENT'
      : 'HIGH'
    : hasPayment || hasAuth || hasTech
    ? 'HIGH'
    : 'MEDIUM';

  return {
    category,
    categoryConfidence: 0.55,
    priority,
    priorityConfidence: hasUrgent ? 0.8 : 0.6,
    sentiment,
    urgency: hasUrgent,
    language: resolveLanguage([text]),
    keywords: [category.split(' / ')[0]].filter(Boolean),
  };
}

export async function listAnalyses(userId: string, limit = 50) {
  return prisma.ticketAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      category: true,
      priority: true,
      sentiment: true,
      urgency: true,
      language: true,
      keywords: true,
      duplicateOf: true,
      duplicateScore: true,
      createdAt: true,
    },
  });
}

export async function getAnalysis(userId: string, id: string) {
  const record = await prisma.ticketAnalysis.findFirst({ where: { id, userId } });
  if (!record) throw new AppError('Analysis not found', StatusCodes.NOT_FOUND);
  return {
    id: record.id,
    category: record.category,
    categoryConfidence: record.categoryConfidence,
    priority: record.priority,
    priorityConfidence: record.priorityConfidence,
    sentiment: record.sentiment,
    urgency: record.urgency,
    language: record.language,
    keywords: keywordsFrom(record.keywords),
    duplicateOf: record.duplicateOf,
    duplicateScore: record.duplicateScore,
    sourceText: record.sourceText,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function deleteAnalysis(userId: string, id: string): Promise<void> {
  const result = await prisma.ticketAnalysis.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw new AppError('Analysis not found', StatusCodes.NOT_FOUND);
}

function keywordsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((k): k is string => typeof k === 'string').slice(0, 8);
  return [];
}

// ---------------------------------------------------------------------------
// Implicit feedback (the "eval ngầm"): when a user clicks Apply on an NLP
// suggestion, that is a positive label; analyzing a result without applying is
// treated as "ignored". Aggregating these lets us measure classification
// quality from real behavior — no manual labeling needed.
// ---------------------------------------------------------------------------

export type NlpDecision = 'applied' | 'ignored';

export async function recordFeedback(input: {
  userId: string;
  analysisId: string;
  category: string;
  priority: string;
  decision: NlpDecision;
}): Promise<void> {
  if (input.decision !== 'applied' && input.decision !== 'ignored') return;
  await prisma.nlpFeedback.create({
    data: {
      userId: input.userId,
      analysisId: input.analysisId,
      category: input.category,
      priority: input.priority,
      decision: input.decision,
    },
  });
}

export interface NlpStatsRow {
  category: string;
  total: number;
  applied: number;
  ignored: number;
  applyRate: number;
}

export interface NlpStats {
  /** Per-category apply rates (sorted by total desc). */
  byCategory: NlpStatsRow[];
  /** Distribution of priorityConfidence buckets across analysed tickets. */
  confidenceBuckets: { bucket: string; count: number }[];
  /** Headline numbers. */
  totalFeedback: number;
  overallApplyRate: number;
}

export async function getNlpStats(userId: string): Promise<NlpStats> {
  const [feedback, analyses] = await Promise.all([
    prisma.nlpFeedback.findMany({
      where: { userId },
      select: { category: true, decision: true },
    }),
    prisma.ticketAnalysis.findMany({
      where: { userId },
      select: { priorityConfidence: true },
    }),
  ]);

  const byCat = new Map<string, { total: number; applied: number; ignored: number }>();
  let totalApplied = 0;
  for (const f of feedback) {
    const row = byCat.get(f.category) ?? { total: 0, applied: 0, ignored: 0 };
    row.total += 1;
    if (f.decision === 'applied') {
      row.applied += 1;
      totalApplied += 1;
    } else {
      row.ignored += 1;
    }
    byCat.set(f.category, row);
  }

  const byCategory: NlpStatsRow[] = [...byCat.entries()]
    .map(([category, r]) => ({
      category,
      total: r.total,
      applied: r.applied,
      ignored: r.ignored,
      applyRate: r.total > 0 ? Number((r.applied / r.total).toFixed(3)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Confidence buckets: <0.5 (low), 0.5–0.7, 0.7–0.85, 0.85–0.95, ≥0.95 (high).
  const buckets: Record<string, number> = {
    'low(<0.5)': 0,
    '0.5-0.7': 0,
    '0.7-0.85': 0,
    '0.85-0.95': 0,
    'high(>=0.95)': 0,
  };
  for (const a of analyses) {
    const c = a.priorityConfidence;
    if (c < 0.5) buckets['low(<0.5)'] += 1;
    else if (c < 0.7) buckets['0.5-0.7'] += 1;
    else if (c < 0.85) buckets['0.7-0.85'] += 1;
    else if (c < 0.95) buckets['0.85-0.95'] += 1;
    else buckets['high(>=0.95)'] += 1;
  }
  const confidenceBuckets = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

  const totalFeedback = feedback.length;
  return {
    byCategory,
    confidenceBuckets,
    totalFeedback,
    overallApplyRate: totalFeedback > 0 ? Number((totalApplied / totalFeedback).toFixed(3)) : 0,
  };
}
