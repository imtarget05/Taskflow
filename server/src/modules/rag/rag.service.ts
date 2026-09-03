import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { embed, embedBatched, isLLMConfigured } from '../agent/llm';

/**
 * Recommendation RAG — Retrieval-Augmented Generation cho Task Recommendation
 * System. Index task/project history thành rag_chunks (pgvector 768-dim),
 * retrieval hybrid (semantic + keyword) fused bằng Reciprocal Rank Fusion
 * (RRF) để grounded recommendations vào lịch sử dự án thật.
 */

export interface RagChunkInput {
  sourceType: 'task' | 'recommendation';
  sourceId: string;
  projectId: string;
  title: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface RagRetrievalResult {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  /** Điểm RRF (cao hơn = liên quan hơn). */
  score: number;
}

interface TaskForChunk {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: Date | null;
  completed: boolean;
  metadata: unknown;
  assignments: { userId: string }[];
}

/** Convert embedding array → pgvector literal cho raw SQL. */
function vectorLiteral(embedding: number[]): string {
  return `'[${embedding.join(',')}]'::vector`;
}

/**
 * Chunking: 1 task = 1 chunk. Nội dung gồm title + description + priority +
 * dueDate + số người được giao — đủ ngữ cảnh cho retrieval mà không cần
 * splitter phức tạp (task hiếm khi vượt quá kích thước embedding hợp lý).
 */
export function chunkProjectTasks(tasks: TaskForChunk[]): RagChunkInput[] {
  return tasks.map((t) => {
    const parts = [`Task: ${t.title}`];
    if (t.description) parts.push(`Mô tả: ${t.description}`);
    parts.push(`Ưu tiên: ${t.priority}`);
    if (t.dueDate) parts.push(`Hạn: ${t.dueDate.toISOString().slice(0, 10)}`);
    if (t.assignments.length > 0) {
      parts.push(`Số người thực hiện: ${t.assignments.length}`);
    }
    parts.push(t.completed ? 'Trạng thái: hoàn thành' : 'Trạng thái: đang mở');
    return {
      sourceType: 'task' as const,
      sourceId: t.id,
      projectId: t.projectId,
      title: t.title,
      content: parts.join('\n'),
      metadata: {
        priority: t.priority,
        completed: t.completed,
        assigneeCount: t.assignments.length,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        ...(typeof t.metadata === 'object' && t.metadata !== null ? t.metadata : {}),
      } as Record<string, unknown>,
    };
  });
}

/**
 * Index toàn bộ task của project vào rag_chunks (upsert theo
 * (sourceType, sourceId)). Trả về số chunk đã ghi.
 * Dùng embedBatched để tránh payload quá lớn khi project nhiều task.
 */
export async function indexProject(projectId: string): Promise<number> {
  const tasks = (await prisma.task.findMany({
    where: { projectId },
    include: { assignments: { select: { userId: true } } },
  })) as unknown as TaskForChunk[];

  const chunks = chunkProjectTasks(tasks);
  if (chunks.length === 0) return 0;
  if (!isLLMConfigured()) {
    throw new AppError(
      'LLM chưa cấu hình — không thể tạo embedding để index RAG',
      StatusCodes.SERVICE_UNAVAILABLE
    );
  }

  const embeddings = await embedBatched(chunks.map((c) => c.content), { batchSize: 32, concurrency: 2 });

  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const vec = embeddings[i];
    if (!vec) continue;
    await prisma.$executeRaw`
      INSERT INTO "rag_chunks" ("id", "sourceType", "sourceId", "projectId", "content", "title", "embedding", "metadata", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(), ${c.sourceType}, ${c.sourceId}, ${c.projectId},
        ${c.content}, ${c.title}, ${Prisma.raw(vectorLiteral(vec))},
        ${c.metadata ? JSON.stringify(c.metadata) : null}::jsonb, NOW(), NOW()
      )
      ON CONFLICT ("sourceType", "sourceId")
      DO UPDATE SET "content" = EXCLUDED."content", "title" = EXCLUDED."title",
        "embedding" = EXCLUDED."embedding", "metadata" = EXCLUDED."metadata",
        "updatedAt" = NOW()
    `;
    written++;
  }
  return written;
}

/**
 * Upsert một task lẻ — dùng cho hook create/update (Tier 1 incremental, không cần re-index toàn bộ).
 * Best-effort: nếu LLM chưa cấu hình thì bỏ qua, không throw.
 */
export async function upsertTaskChunk(taskId: string): Promise<void> {
  if (!isLLMConfigured()) return;
  const task = (await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignments: { select: { userId: true } } },
  })) as unknown as TaskForChunk | null;
  if (!task) return;
  const chunks = chunkProjectTasks([task]);
  if (chunks.length === 0) return;
  const c = chunks[0];
  try {
    const [vec] = await embed([c.content]);
    if (!vec) return;
    await prisma.$executeRaw`
      INSERT INTO "rag_chunks" ("id", "sourceType", "sourceId", "projectId", "content", "title", "embedding", "metadata", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(), ${c.sourceType}, ${c.sourceId}, ${c.projectId},
        ${c.content}, ${c.title}, ${Prisma.raw(vectorLiteral(vec))},
        ${c.metadata ? JSON.stringify(c.metadata) : null}::jsonb, NOW(), NOW()
      )
      ON CONFLICT ("sourceType", "sourceId")
      DO UPDATE SET "content" = EXCLUDED."content", "title" = EXCLUDED."title",
        "embedding" = EXCLUDED."embedding", "metadata" = EXCLUDED."metadata",
        "updatedAt" = NOW()
    `;
  } catch {
    // best-effort — không block task CRUD
  }
}

export async function deleteTaskChunk(taskId: string): Promise<void> {
  try {
    await prisma.ragChunk.deleteMany({ where: { sourceType: 'task', sourceId: taskId } });
  } catch {
    // best-effort
  }
}

/**
 * Reciprocal Rank Fusion: gộp 2 kênh ranked lists thành 1 danh sách duy nhất.
 * score(item) = Σ 1 / (k + rank_i), k = 60 (chuẩn RRF).
 */
export function fuseRRF(
  semantic: Omit<RagRetrievalResult, 'score'>[],
  keyword: Omit<RagRetrievalResult, 'score'>[],
  topK: number
): RagRetrievalResult[] {
  const K = 60;
  const scores = new Map<string, { item: Omit<RagRetrievalResult, 'score'>; score: number }>();

  const addChannel = (items: Omit<RagRetrievalResult, 'score'>[]) => {
    items.forEach((item, idx) => {
      const prev = scores.get(item.id);
      const contribution = 1 / (K + idx + 1);
      if (prev) prev.score += contribution;
      else scores.set(item.id, { item, score: contribution });
    });
  };

  addChannel(semantic);
  addChannel(keyword);

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ item, score }) => ({ ...item, score }));
}

/** Kiểm tra user có quyền đọc project (member hoặc owner). */
export async function assertProjectAccess(userId: string, projectId: string, minRole: 'VIEWER' | 'MEMBER' = 'VIEWER'): Promise<void> {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  if (member) {
    if (minRole === 'MEMBER' && member.role === 'VIEWER') {
      throw new AppError('Bạn không có quyền thực hiện hành động này (cần MEMBER)', StatusCodes.FORBIDDEN);
    }
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) {
    throw new AppError('Không tìm thấy project', StatusCodes.NOT_FOUND);
  }
  if (project.ownerId !== userId) {
    throw new AppError('Bạn không có quyền truy cập project này', StatusCodes.FORBIDDEN);
  }
}

/**
 * Hybrid retrieval: semantic (pgvector cosine) + keyword (ILIKE). Fuse bằng
 * RRF. Khi LLM chưa cấu hình → keyword-only.
 */
export async function retrieve(
  userId: string,
  query: string,
  opts: { projectId?: string; topK?: number } = {}
): Promise<RagRetrievalResult[]> {
  const topK = Math.min(Math.max(opts.topK ?? 5, 1), 20);
  const projectFilter = opts.projectId
    ? Prisma.sql`AND "projectId" = ${opts.projectId}`
    : Prisma.empty;

  if (opts.projectId) {
    await assertProjectAccess(userId, opts.projectId);
  }

  let semanticRows: RagChunkRow[] = [];
  if (isLLMConfigured()) {
    try {
      const [vec] = await embed([query]);
      if (vec) {
        semanticRows = await prisma.$queryRaw<RagChunkRow[]>(Prisma.sql`
          SELECT "id", "sourceType", "sourceId", "title", "content", "metadata"
          FROM "rag_chunks"
          WHERE "embedding" IS NOT NULL ${projectFilter}
          ORDER BY "embedding" <=> ${Prisma.raw(vectorLiteral(vec))}
          LIMIT ${topK}
        `);
      }
    } catch {
      // Semantic kênh fail → vẫn còn kênh keyword.
    }
  }

  const kw = `%${query.replace(/[%_]/g, '')}%`;
  const keywordRows = await prisma.$queryRaw<RagChunkRow[]>(Prisma.sql`
    SELECT "id", "sourceType", "sourceId", "title", "content", "metadata"
    FROM "rag_chunks"
    WHERE ("title" ILIKE ${kw} OR "content" ILIKE ${kw}) ${projectFilter}
    ORDER BY "updatedAt" DESC
    LIMIT ${topK}
  `);

  return fuseRRF(semanticRows, keywordRows, topK);
}

interface RagChunkRow {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
}

