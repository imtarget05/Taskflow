import { Annotation, END, StateGraph, START } from '@langchain/langgraph';
import { PromptTemplate } from '@langchain/core/prompts';
import { createHash } from 'crypto';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { chatCompletion, embed, modelForTier, rerank, routeModel } from '../agent/llm';

export interface LegalCitation {
  document: string;
  article: string;
  url: string;
}

export interface LegalSearchResult {
  answer: string;
  citations: LegalCitation[];
  disclaimer: string;
  modelUsed: string | null;
  cached: boolean;
}

export interface LegalStatus {
  enabled: boolean;
  indexedDocuments: number;
  indexedChunks: number;
  neuronBudgetDaily: number;
  usageToday: { requests: number; inputTokens: number; outputTokens: number };
}

export const DISCLAIMER =
  'Thông tin mang tính tham khảo, không phải tư vấn pháp lý chính thức. ' +
  'Hãy đối chiếu với văn bản gốc tại nguồn được trích dẫn.';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // deterministic cache: 7 days
const TOP_K_RETRIEVE = 20;
const RERANK_CANDIDATES = 15;
const TOP_K_RERANK = 6;
const MIN_SIMILARITY = 0.3; // cosine; below this treat as "not found"
const MAX_QUESTION_LENGTH = 2000;
const MAX_ANSWER_LENGTH = 4000;

// ---------------------------------------------------------------------------
// LangChain: legal answer template. Citations are mandatory — the model is
// instructed to only answer from the retrieved context and to quote sources.
// ---------------------------------------------------------------------------
const LEGAL_PROMPT = PromptTemplate.fromTemplate(`Bạn là trợ lý tra cứu pháp luật Việt Nam chuyên nghiệp.

QUY TẮC NGHIÊM NGẶT:
1. Chỉ trả lời dựa trên tài liệu pháp luật được cung cấp bên dưới. TUYỆT ĐỐI KHÔNG bịa đặt điều luật, số điều, hoặc nguồn trích dẫn.
2. Mỗi luận điểm phải kèm trích dẫn dạng [Điều X – Tên văn bản – URL nguồn] nếu có.
3. Nếu tài liệu không đủ thông tin để trả lời, hãy nói rõ "Tài liệu hiện có không đủ để trả lời câu hỏi này" và gợi ý câu hỏi cụ thể hơn.
4. Trả lời tiếng Việt, ngắn gọn, có cấu trúc (dùng danh sách khi cần).
5. Cuối câu trả lời, xuất JSON citations chứa MỘT dòng duy nhất theo định dạng:
   CITATIONS_JSON: [{{"document":"Tên văn bản","article":"Điều X","url":"https://..."}}]
   Chỉ liệt kê trích dẫn thực sự xuất hiện trong câu trả lời. Nếu không có, xuất CITATIONS_JSON: []

CÂU HỎI: {question}

TÀI LIỆU (đã chọn lọc):
{context}`);

// ---------------------------------------------------------------------------
// LangGraph state + nodes: retrieve → rerank → generate → validate
// ---------------------------------------------------------------------------
const LegalState = Annotation.Root({
  question: Annotation<string>,
  chunks: Annotation<LegalChunkRow[]>({ reducer: (_a, b) => b }),
  citations: Annotation<LegalCitation[]>({ reducer: (_a, b) => b }),
  answer: Annotation<string | null>({ reducer: (_a, b) => b }),
  modelUsed: Annotation<string | null>({ reducer: (_a, b) => b }),
  found: Annotation<boolean>({ reducer: (_a, b) => b }),
  warnNoCitation: Annotation<boolean>({ reducer: (_a, b) => b }),
});

interface LegalGraphState {
  question: string;
  chunks: LegalChunkRow[];
  citations: LegalCitation[];
  answer: string | null;
  modelUsed: string | null;
  found: boolean;
  warnNoCitation: boolean;
}

interface LegalChunkRow {
  id: string;
  articleRef: string;
  content: string;
  title: string;
  sourceUrl: string;
  documentNumber: string | null;
  similarity: number;
}

function vectorLiteral(embedding: number[]): string {
  return `'[${embedding.join(',')}]'::vector`;
}

async function retrieveNode(state: LegalGraphState) {
  const [vector] = await embed([state.question]);
  const rows = await prisma.$queryRaw<LegalChunkRow[]>(Prisma.sql`
    SELECT c."id", c."articleRef", c."content", d."title", d."sourceUrl", d."documentNumber",
           1 - (c."embedding" <=> ${Prisma.raw(vectorLiteral(vector))}) AS "similarity"
    FROM "legal_chunks" c
    JOIN "legal_documents" d ON d."id" = c."documentId"
    ORDER BY c."embedding" <=> ${Prisma.raw(vectorLiteral(vector))}
    LIMIT ${TOP_K_RETRIEVE}
  `);

  const found = rows.length > 0 && rows[0].similarity >= MIN_SIMILARITY;
  if (!found) {
    const best = rows.length > 0 ? rows[0].similarity.toFixed(2) : '0';
    return {
      chunks: [],
      citations: [],
      found: false,
      warnNoCitation: false,
      modelUsed: null,
      answer:
        `Không tìm thấy tài liệu phù hợp trong kho dữ liệu pháp luật hiện có (độ tương đồng cao nhất: ${best}). ` +
        'Vui lòng đặt lại câu hỏi cụ thể hơn (kèm tên văn bản hoặc chủ đề điều luật).',
    };
  }
  return { chunks: rows, found: true };
}

async function rerankNode(state: LegalGraphState) {
  const candidates = state.chunks.slice(0, RERANK_CANDIDATES);
  const scores = await rerank(
    state.question,
    candidates.map((c) => c.content)
  );
  const top = scores
    .slice(0, TOP_K_RERANK)
    .map((s) => candidates[s.index])
    .filter(Boolean);
  return { chunks: top.length > 0 ? top : candidates.slice(0, TOP_K_RERANK) };
}

function extractCitations(reply: string, chunks: LegalChunkRow[]): LegalCitation[] {
  const match = reply.match(/CITATIONS_JSON:\s*(\[[\s\S]*?\])/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as LegalCitation[];
      const knownUrls = new Set(chunks.map((c) => c.sourceUrl));
      // Never emit a citation that is not backed by the retrieved context.
      return parsed.filter((c) => knownUrls.has(c.url));
    } catch {
      // fall through to heuristic extraction
    }
  }
  // Heuristic fallback: cite the top chunks actually referenced by article refs.
  const refs = (reply.match(/Điều\s+\d+/gi) ?? []).map((r) => r.toLowerCase());
  const cited = chunks.filter((c) => refs.some((r) => c.articleRef.toLowerCase().includes(r)));
  return cited.slice(0, 3).map((c) => ({
    document: c.title,
    article: c.articleRef,
    url: c.sourceUrl,
  }));
}

async function generateNode(state: LegalGraphState) {
  const context = state.chunks
    .map((c) => `[${c.articleRef}] (${c.documentNumber ?? c.title}) ${c.content}`)
    .join('\n\n');
  const prompt = await LEGAL_PROMPT.format({ question: state.question, context });

  const tier = routeModel(state.question);
  const model = modelForTier(tier);
  const reply = await chatCompletion([{ role: 'user', content: prompt }], {
    model,
    temperature: 0.3,
    maxTokens: 1500,
  });

  const answer = reply.slice(0, MAX_ANSWER_LENGTH);
  const citations = extractCitations(reply, state.chunks);

  await prisma.aIUsage.create({
    data: {
      model,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(reply.length / 4),
    },
  });

  return {
    answer,
    citations,
    modelUsed: model,
    warnNoCitation: citations.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Graph assembly (compiled once, reused across requests)
// ---------------------------------------------------------------------------
let graph: ReturnType<typeof buildLegalGraph> | null = null;

function buildLegalGraph() {
  return new StateGraph(LegalState)
    .addNode('retrieve', retrieveNode)
    .addNode('rerank', rerankNode)
    .addNode('generate', generateNode)
    .addEdge(START, 'retrieve')
    .addConditionalEdges('retrieve', (state) => (state.found ? 'rerank' : END))
    .addEdge('rerank', 'generate')
    .addEdge('generate', END)
    .compile();
}

function getGraph() {
  if (!graph) graph = buildLegalGraph();
  return graph;
}

function questionHash(question: string): string {
  return createHash('sha256').update(question.trim().toLowerCase()).digest('hex');
}

export async function searchLegal(userId: string, question: string): Promise<LegalSearchResult> {
  void userId; // reserved: per-user legal history (Phase 2)
  if (!env.LEGAL_ENABLED) {
    throw new AppError('Legal research is not enabled', StatusCodes.SERVICE_UNAVAILABLE);
  }
  const q = question.trim();
  if (q.length < 5 || q.length > MAX_QUESTION_LENGTH) {
    throw new AppError('Question must be between 5 and 2000 characters', StatusCodes.BAD_REQUEST);
  }

  const hash = questionHash(q);
  const cached = await prisma.legalCache.findUnique({ where: { questionHash: hash } });
  if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
    return {
      answer: cached.answer,
      citations: (cached.citations as LegalCitation[] | null) ?? [],
      disclaimer: DISCLAIMER,
      modelUsed: cached.modelUsed,
      cached: true,
    };
  }

  const result = await getGraph().invoke({ question: q });

  await prisma.legalCache.upsert({
    where: { questionHash: hash },
    update: {
      answer: result.answer ?? '',
      citations: result.citations as unknown as Prisma.InputJsonValue,
      modelUsed: result.modelUsed,
      createdAt: new Date(),
    },
    create: {
      questionHash: hash,
      question: q,
      answer: result.answer ?? '',
      citations: result.citations as unknown as Prisma.InputJsonValue,
      modelUsed: result.modelUsed,
    },
  });

  return {
    answer: result.answer ?? '',
    citations: result.citations,
    disclaimer: DISCLAIMER,
    modelUsed: result.modelUsed,
    cached: false,
  };
}

export async function legalStatus(): Promise<LegalStatus> {
  const [docs, chunks, usageAgg] = await Promise.all([
    prisma.legalDocument.count(),
    prisma.legalChunk.count(),
    prisma.aIUsage.aggregate({
      _count: { id: true },
      _sum: { inputTokens: true, outputTokens: true },
      where: { createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } },
    }),
  ]);
  return {
    enabled: env.LEGAL_ENABLED,
    indexedDocuments: docs,
    indexedChunks: chunks,
    neuronBudgetDaily: 10_000,
    usageToday: {
      requests: usageAgg._count.id,
      inputTokens: usageAgg._sum.inputTokens ?? 0,
      outputTokens: usageAgg._sum.outputTokens ?? 0,
    },
  };
}