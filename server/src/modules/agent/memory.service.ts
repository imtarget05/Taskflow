import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { chatCompletion, embed, isLLMConfigured } from './llm';

/**
 * Memory categories — used to classify what kind of information a node holds.
 * Drives retrieval weighting and prompt injection style.
 */
export type MemoryCategory = 'preference' | 'fact' | 'decision' | 'context';

/**
 * Relation types for the memory graph edges. Traversal during retrieval can
 * follow these edges to expand context (e.g. a "decision" node causes a
 * "fact" node that records the outcome).
 */
export type MemoryRelationType = 'related_to' | 'causes' | 'precedes' | 'contradicts';

export interface MemoryNodeRow {
  id: string;
  userId: string;
  content: string;
  category: MemoryCategory;
  source: string;
  confidence: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryWithRelations extends MemoryNodeRow {
  outgoingRelations: Array<{
    id: string;
    relationType: MemoryRelationType;
    strength: number;
    target: MemoryNodeRow;
  }>;
}

interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
}

const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction engine. Given a conversation between a user and an AI assistant, extract the user's key preferences, facts, decisions, and contextual information worth remembering for future sessions.

Rules:
- Only extract information the USER explicitly states or strongly implies. Do NOT invent or infer.
- Each memory should be a single concise sentence (under 40 words).
- Category must be one of: preference (user likes/dislikes), fact (objective information about the user), decision (a choice the user made), context (project/work context).
- Return a JSON array: [{"content": "...", "category": "preference|fact|decision|context"}]
- Return [] if nothing worth remembering.
- Output ONLY the JSON array, no markdown, no explanation.`;

/**
 * Convert an embedding vector to a pgvector literal for raw SQL queries.
 */
function vectorLiteral(embedding: number[]): string {
  return `'[${embedding.join(',')}]'::vector`;
}

/**
 * Extract key facts/preferences from conversation text using the LLM.
 * Falls back to returning an empty array when the LLM is unavailable.
 */
export async function extractMemories(
  _userId: string,
  conversationText: string
): Promise<ExtractedMemory[]> {
  if (!isLLMConfigured()) return [];

  try {
    const out = await chatCompletion([
      { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
      { role: 'user', content: conversationText.slice(0, 8000) },
    ], { maxTokens: 1024, temperature: 0.3 });

    const parsed = JSON.parse(out.trim()) as unknown;
    if (!Array.isArray(parsed)) return [];

    const memories: ExtractedMemory[] = [];
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'content' in item &&
        'category' in item &&
        typeof item.content === 'string' &&
        ['preference', 'fact', 'decision', 'context'].includes(item.category as string)
      ) {
        memories.push({
          content: item.content.trim(),
          category: item.category as MemoryCategory,
        });
      }
    }
    return memories;
  } catch {
    // Best-effort extraction; never throw into the chat flow.
    return [];
  }
}

/**
 * Store a memory node with its pgvector embedding for semantic search.
 * Skips storage when the LLM/embed service is unavailable (no embedding = no retrieval).
 */
export async function storeMemory(
  userId: string,
  content: string,
  category: MemoryCategory,
  source: string = 'conversation',
  confidence: number = 1.0,
  metadata: Record<string, unknown> | null = null
): Promise<MemoryNodeRow | null> {
  let embedding: number[] | undefined;

  if (isLLMConfigured()) {
    try {
      const [vec] = await embed([content]);
      embedding = vec;
    } catch {
      // No embedding available — store without it (retrieval won't find it, but the record exists).
    }
  }

  const data: Prisma.MemoryNodeCreateInput = {
    user: { connect: { id: userId } },
    content,
    category,
    source,
    confidence,
    metadata: metadata as Prisma.InputJsonValue,
    ...(embedding ? { embedding } : {}),
  };

  return prisma.memoryNode.create({ data }) as unknown as MemoryNodeRow;
}

/**
 * Batch-store multiple extracted memories after a conversation turn.
 */
export async function storeMemories(
  userId: string,
  memories: ExtractedMemory[],
  source: string = 'conversation'
): Promise<MemoryNodeRow[]> {
  const stored: MemoryNodeRow[] = [];
  for (const mem of memories) {
    try {
      const row = await storeMemory(userId, mem.content, mem.category, source);
      if (row) stored.push(row);
    } catch {
      // Skip failed stores; best-effort persistence.
    }
  }
  return stored;
}

/**
 * Semantic search over a user's memory nodes using pgvector cosine similarity.
 * Falls back to a recent-first list when no embedding service is available.
 */
export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  limit: number = 5
): Promise<MemoryNodeRow[]> {
  if (isLLMConfigured()) {
    try {
      const [vec] = await embed([query]);
      const rows = await prisma.$queryRaw<MemoryNodeRow[]>(Prisma.sql`
        SELECT "id", "userId", "content", "category", "source", "confidence", "metadata", "createdAt", "updatedAt"
        FROM "memory_nodes"
        WHERE "userId" = ${userId} AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${Prisma.raw(vectorLiteral(vec))}
        LIMIT ${limit}
      `);
      return rows;
    } catch {
      // Fall through to recent-first fallback.
    }
  }

  // Fallback: return the most recent memories (no semantic ranking).
  return prisma.memoryNode.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  }) as unknown as MemoryNodeRow[];
}

/**
 * Build a context string from relevant memories to inject into the system prompt.
 * Returns an empty string when no relevant memories exist.
 */
export async function buildMemoryContext(
  userId: string,
  currentMessage: string
): Promise<string> {
  const memories = await retrieveRelevantMemories(userId, currentMessage, 5);
  if (memories.length === 0) return '';

  const lines = memories.map((m) => `- [${m.category}] ${m.content}`);
  return `## RELEVANT USER MEMORIES\n${lines.join('\n')}`;
}

/**
 * Aggregate memories into a cross-session summary. Uses the LLM to produce
 * a compact narrative of what is known about the user; falls back to a
 * bullet list when the LLM is unavailable.
 */
export async function crossSessionSummary(userId: string): Promise<string> {
  const memories = await prisma.memoryNode.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (memories.length === 0) return '';

  const memoryList = memories.map((m) => `[${m.category}] ${m.content}`).join('\n');

  if (!isLLMConfigured()) {
    return memoryList.split('\n').slice(0, 10).join('\n');
  }

  try {
    const out = await chatCompletion([
      {
        role: 'system',
        content:
          'Summarize the following user memories into one compact paragraph (max 100 words) in the same language as the memories. Output ONLY the summary.',
      },
      { role: 'user', content: memoryList },
    ], { maxTokens: 256, temperature: 0.5 });

    return out.trim() || memoryList.split('\n').slice(0, 10).join('\n');
  } catch {
    return memoryList.split('\n').slice(0, 10).join('\n');
  }
}

/**
 * Create a typed edge between two memory nodes.
 */
export async function createRelation(
  sourceId: string,
  targetId: string,
  relationType: MemoryRelationType,
  strength: number = 1.0
): Promise<void> {
  await prisma.memoryRelation.create({
    data: { sourceId, targetId, relationType, strength },
  });
}

/**
 * List all memory nodes for a user, optionally filtered by category.
 */
export async function listMemories(
  userId: string,
  category?: MemoryCategory
): Promise<MemoryNodeRow[]> {
  return prisma.memoryNode.findMany({
    where: { userId, ...(category ? { category } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }) as unknown as MemoryNodeRow[];
}

/**
 * Delete a memory node (its cascade-deletes connected relations).
 */
export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const result = await prisma.memoryNode.deleteMany({
    where: { id: memoryId, userId },
  });
  if (result.count === 0) {
    throw new AppError('Memory not found', StatusCodes.NOT_FOUND);
  }
}
